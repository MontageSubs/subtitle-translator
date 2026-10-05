import { AUTO_DETECT_CODE } from "../../utils/languageProfiles";
import { abortError, WorkerRequestError } from "./errors";
import { createJobAccumulator } from "./jobAccumulator";
import { postTranslateJob } from "./jobAttempt";
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

function planRetryRound(outstanding: Cue[], round: number): RetryPlan {
  const size = retryChunkSize(round);
  const chunks = chunkCues(outstanding, size);
  return { chunks, canEstablishScope: size >= RETRY_TOKEN_BATCH_CAP && chunks.length > 1 };
}

function buildRetryJob(job: TranslateJobPayload, round: number, cues: Cue[], retryToken: string | undefined, establishing: boolean): TranslateJobPayload {
  return {
    ...job,
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
      await runRound({ ...job, attemptNumber: 1 });
    } else {
      onLog?.(`Auto-retrying ${outstanding.length} missing cue(s) (round ${round}/${MAX_AUTO_RETRY_ROUNDS})...`);
      const { chunks, canEstablishScope } = planRetryRound(outstanding, round);
      for (const [index, chunk] of chunks.entries()) {
        const token = accumulator.retryToken();
        const usingToken = Boolean(token && isTokenFresh(token));
        const establishing = !usingToken && canEstablishScope && index === 0;
        const retryJob = buildRetryJob(job, round, establishing ? outstanding : chunk, usingToken ? token : undefined, establishing);
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
