import { DEFAULT_SCENE_CHANGE_SECONDS } from "../../lib/subtitle/common/sceneThreads";
import { AUTO_DETECT_CODE } from "../../utils/languageProfiles";
import { planRequests } from "./batchPlanner";
import { limitsForModel } from "./capabilities";
import { abortError, WorkerRequestError } from "./errors";
import { createJobAccumulator } from "./jobAccumulator";
import { postTranslateJob } from "./jobAttempt";
import { resolveCapabilities } from "./session";
import { isTokenFresh } from "./tokens";
import type { JobCallbacks, TranslateJobPayload, TranslateJobResponse } from "./types";

type Cue = TranslateJobPayload["cues"][number];

const MAX_AUTO_RETRY_ROUNDS = 2;
const LIGHT_RETRY_CUE_LIMIT = 1000;
const RETRY_CHUNK_SIZES = [1000, 300];
const RETRY_TOKEN_BATCH_CAP = 1000;

function retryChunkSize(round: number): number {
  return RETRY_CHUNK_SIZES[round - 1] ?? RETRY_CHUNK_SIZES[RETRY_CHUNK_SIZES.length - 1];
}

function chunkCues(cues: Cue[], size: number): Cue[][] {
  const chunks: Cue[][] = [];
  for (let start = 0; start < cues.length; start += size) chunks.push(cues.slice(start, start + size));
  return chunks.length ? chunks : [cues];
}

interface RetryPlan {
  chunks: Cue[][];
  canEstablishScope: boolean;
}

function planRetryRound(outstanding: Cue[], round: number, maxCuesPerRequest: number): RetryPlan {
  const size = retryChunkSize(round);
  const chunks = chunkCues(outstanding, size);
  return { chunks, canEstablishScope: size >= RETRY_TOKEN_BATCH_CAP && chunks.length > 1 && outstanding.length <= maxCuesPerRequest };
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

  async function runRound(subJob: TranslateJobPayload): Promise<boolean> {
    if (signal?.aborted) throw abortError();
    try {
      accumulator.absorb(await postTranslateJob(subJob, { onLog, onProgress: reportProgress, signal }));
      return true;
    } catch (error) {
      if (error instanceof WorkerRequestError && error.partialResult?.cues?.length) {
        onLog?.(`Stream interrupted: ${error.message}. Resuming from partial result...`);
        accumulator.absorb(error.partialResult);
        return true;
      }
      if (!accumulator.hasAnyResult()) throw error;
      onLog?.(`Round failed (${error instanceof Error ? error.message : String(error)}), keeping ${accumulator.translatedCount()} cue(s) already translated.`);
      return false;
    }
  }

  for (let round = 0; round <= MAX_AUTO_RETRY_ROUNDS; round++) {
    const outstanding = accumulator.outstandingCues();
    if (round > 0 && !outstanding.length) break;

    if (round === 0) {
      const plan = planRequests(job.cues, {
        sceneSeconds: job.sceneChangeSeconds ?? DEFAULT_SCENE_CHANGE_SECONDS,
        limits: limitsForModel(capabilities, job.provider),
        maxCuesPerRequest: capabilities.maxCuesPerRequest,
        contextChars: job.contextText?.length ?? 0,
        contextRequests: contextRequestCount(job),
      });
      const requests = plan.parts.length;
      onLog?.(`00:00:00.000 [INFO] [Plan] estimated batches=${plan.estimatedBatches.join("+")} capacity=${plan.batchCapacity} requests=${requests}`);
      for (const [index, part] of plan.parts.entries()) {
        if (requests > 1) onLog?.(`Translating batch ${index + 1}/${requests} (${part.length} cues)...`);
        if (!(await runRound({ ...job, cues: part, attemptNumber: 1, batchReport: [index + 1, requests] }))) break;
      }
    } else {
      onLog?.(`Auto-retrying ${outstanding.length} missing cue(s) (round ${round}/${MAX_AUTO_RETRY_ROUNDS})...`);
      const { chunks, canEstablishScope } = planRetryRound(outstanding, round, capabilities.maxCuesPerRequest);
      for (const [index, chunk] of chunks.entries()) {
        const token = accumulator.retryToken();
        const usingToken = Boolean(token && isTokenFresh(token));
        const establishing = !usingToken && canEstablishScope && index === 0;
        const retryJob = buildRetryJob(job, round, establishing ? outstanding : chunk, usingToken ? token : undefined, establishing, [index + 1, chunks.length]);
        if (!(await runRound(retryJob))) break;
      }
    }

    if (round === MAX_AUTO_RETRY_ROUNDS) {
      const remaining = accumulator.outstandingCues().length;
      if (remaining > 0) onLog?.(`Auto-retry exhausted, ${remaining} cue(s) remain untranslated.`);
    }
  }

  return accumulator.finalize();
}
