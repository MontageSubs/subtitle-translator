import { cueSceneIndexes, DEFAULT_SCENE_CHANGE_SECONDS } from "../../lib/subtitle/common/sceneThreads";
import { AUTO_DETECT_CODE } from "../../utils/languageProfiles";
import { planRequests } from "./batchPlanner";
import { limitsForModel } from "./capabilities";
import { abortError, WorkerRequestError } from "./errors";
import { createJobAccumulator } from "./jobAccumulator";
import { postTranslateJob } from "./jobAttempt";
import { sceneAlignedChunks } from "./sceneChunks";
import { resolveCapabilities } from "./session";
import { isTokenFresh } from "./tokens";
import type { JobCallbacks, TranslateJobPayload, TranslateJobResponse } from "./types";

type Cue = TranslateJobPayload["cues"][number];

const MAX_AUTO_RETRY_ROUNDS = 2;
const LIGHT_RETRY_CUE_LIMIT = 1000;
const RETRY_CHUNK_CUES = [1000, 300];
const SCENE_LEVEL_CHUNK_CUES = 300;
const RETRY_TOKEN_BATCH_CAP = 1000;

type RoundOutcome = "complete" | "cut" | "failed";

function retryChunkCues(round: number, sceneLevel: boolean): number {
  return sceneLevel ? SCENE_LEVEL_CHUNK_CUES : RETRY_CHUNK_CUES[round - 1] ?? SCENE_LEVEL_CHUNK_CUES;
}

interface RetryPlan {
  chunks: Cue[][];
  canEstablishScope: boolean;
}

function planRetryRound(outstanding: Cue[], chunkCues: number, sceneById: ReadonlyMap<number, number>): RetryPlan {
  const chunks = sceneAlignedChunks(outstanding, sceneById, chunkCues);
  return { chunks, canEstablishScope: chunkCues >= RETRY_TOKEN_BATCH_CAP && chunks.length > 1 };
}

function contextRequestCount(job: TranslateJobPayload): number {
  if (!job.contextText || !job.contextNeedsTranslation) return 0;
  return job.source === AUTO_DETECT_CODE ? 2 : 1;
}

function buildRetryJob(job: TranslateJobPayload, round: number, cues: Cue[], retryToken: string | undefined, establishing: boolean, batchReport: [number, number]): TranslateJobPayload {
  return {
    ...job,
    batchReport,
    cues,
    retryToken,
    requestRetryToken: establishing,
    isRetry: true,
    attemptNumber: round + 1,
    ...(cues.length < LIGHT_RETRY_CUE_LIMIT ? { source: AUTO_DETECT_CODE, contextText: undefined, contextNeedsTranslation: undefined } : {}),
  };
}

export async function completeTranslateJob(job: TranslateJobPayload, { onLog, onProgress, signal }: JobCallbacks = {}): Promise<TranslateJobResponse> {
  const accumulator = createJobAccumulator(job);
  const capabilities = await resolveCapabilities(signal);
  const reportProgress = onProgress ? (partial: TranslateJobResponse) => onProgress(accumulator.displayProgress(partial)) : undefined;
  const sceneSeconds = job.sceneChangeSeconds ?? DEFAULT_SCENE_CHANGE_SECONDS;
  const sceneById = new Map(cueSceneIndexes(job.cues, sceneSeconds).map((scene, index) => [job.cues[index]!.id, scene]));
  let sceneLevel = false;
  let halted = false;

  async function runRound(subJob: TranslateJobPayload): Promise<RoundOutcome> {
    if (signal?.aborted) throw abortError();
    try {
      accumulator.absorb(await postTranslateJob(subJob, { onLog, onProgress: reportProgress, signal }));
      return "complete";
    } catch (error) {
      if (error instanceof WorkerRequestError && error.partialResult?.cues?.length) {
        onLog?.(`Stream interrupted: ${error.message}. Resuming from partial result...`);
        accumulator.absorb(error.partialResult);
        return error.streamCut ? "cut" : "complete";
      }
      if (!accumulator.hasAnyResult()) throw error;
      onLog?.(`Round failed (${error instanceof Error ? error.message : String(error)}), keeping ${accumulator.translatedCount()} cue(s) already translated.`);
      return "failed";
    }
  }

  function noteCut(alreadySceneLevel: boolean): void {
    if (alreadySceneLevel) {
      halted = true;
      onLog?.("00:00:00.000 [ERROR] [Engine] request cut again at scene level, auto-retry stopped");
      return;
    }
    sceneLevel = true;
    onLog?.("00:00:00.000 [WARN] [Engine] request cut mid-stream, retrying outstanding cues at scene level");
  }

  for (let round = 0; round <= MAX_AUTO_RETRY_ROUNDS && !halted; round++) {
    const outstanding = accumulator.outstandingCues();
    if (round > 0 && !outstanding.length) break;

    if (round === 0) {
      const plan = planRequests(job.cues, {
        sceneSeconds,
        limits: limitsForModel(capabilities, job.provider),
        contextChars: job.contextText?.length ?? 0,
        contextRequests: contextRequestCount(job),
      });
      const requests = plan.parts.length;
      onLog?.(`00:00:00.000 [INFO] [Plan] estimated batches=${plan.estimatedBatches.join("+")} capacity=${plan.batchCapacity} requests=${requests}`);
      for (const [index, part] of plan.parts.entries()) {
        if (requests > 1) onLog?.(`Translating batch ${index + 1}/${requests} (${part.length} cues)...`);
        const outcome = await runRound({ ...job, cues: part, attemptNumber: 1, batchReport: [index + 1, requests] });
        if (outcome === "cut") noteCut(false);
        if (outcome !== "complete") break;
      }
    } else {
      const chunkCues = retryChunkCues(round, sceneLevel);
      const atSceneLevel = chunkCues <= SCENE_LEVEL_CHUNK_CUES;
      onLog?.(`Auto-retrying ${outstanding.length} missing cue(s) (round ${round}/${MAX_AUTO_RETRY_ROUNDS})...`);
      const { chunks, canEstablishScope } = planRetryRound(outstanding, chunkCues, sceneById);
      for (const [index, chunk] of chunks.entries()) {
        const pending = chunk.filter((cue) => accumulator.isOutstanding(cue));
        if (!pending.length) continue;
        const token = accumulator.retryToken();
        const usingToken = Boolean(token && isTokenFresh(token));
        const establishing = !usingToken && canEstablishScope && index === 0;
        const retryJob = buildRetryJob(job, round, establishing ? outstanding : pending, usingToken ? token : undefined, establishing, [index + 1, chunks.length]);
        const outcome = await runRound(retryJob);
        if (outcome === "cut") noteCut(atSceneLevel);
        if (outcome !== "complete") break;
      }
    }

    if (round === MAX_AUTO_RETRY_ROUNDS && !halted) {
      const remaining = accumulator.outstandingCues().length;
      if (remaining > 0) onLog?.(`Auto-retry exhausted, ${remaining} cue(s) remain untranslated.`);
    }
  }

  if (!halted) return accumulator.finalize();
  if (!accumulator.hasAnyResult()) throw new WorkerRequestError("worker resource limit hit at scene level", { code: "worker_limit" });
  return { ...accumulator.finalize(), halt_reason: "worker_limit" };
}
