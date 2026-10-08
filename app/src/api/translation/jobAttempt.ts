import { joinCueLines } from "../../lib/subtitle/extraction/styleWraps";
import { computeProofVector } from "../../utils/envProbe";
import { computeAnswer } from "./challenge";
import { WorkerRequestError } from "./errors";
import { withRetry } from "./retry";
import { adoptSession, takeSession } from "./session";
import { postStream } from "./stream";
import { currentClearance, isTokenFresh } from "./tokens";
import type { JobCallbacks, TranslateJobPayload, TranslateJobResponse } from "./types";

async function buildHandshakeBody(job: TranslateJobPayload, wireCues: Pick<TranslateJobPayload["cues"][number], "id" | "start_ms" | "end_ms" | "text">[], signal?: AbortSignal): Promise<Record<string, unknown>> {
  const active = await takeSession(signal);
  const proof = await computeProofVector(active.nonce, active.recipe).catch(() => undefined);
  const proofCommitment = proof ? proof.transcript[proof.transcript.length - 1] : NaN;
  const answer = await computeAnswer(active.challengeKey, proofCommitment);
  const clearance = currentClearance();
  return {
    token: active.token,
    answer,
    proof,
    ...job,
    retryToken: undefined,
    cues: wireCues,
    ...(clearance ? { clearance } : {}),
  };
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function attemptTranslateJob(job: TranslateJobPayload, { onLog, onProgress, signal }: JobCallbacks): Promise<TranslateJobResponse> {
  const wireCues = job.cues.map(({ id, start_ms, end_ms, text }) => ({ id, start_ms, end_ms, text: joinCueLines(text) }));
  const send = (body: Record<string, unknown>) =>
    postStream("/translate-job", body, wireCues, { onLog, onProgress, onSession: (payload) => adoptSession(payload) }, signal);
  const useRetryToken = Boolean(job.retryToken && isTokenFresh(job.retryToken));

  try {
    return await send(useRetryToken ? { ...job, cues: wireCues } : await buildHandshakeBody(job, wireCues, signal));
  } catch (error) {
    if (useRetryToken && error instanceof WorkerRequestError && error.code === "retry_token_invalid") {
      onLog?.("Retry token rejected by server, falling back to a fresh handshake...");
      try {
        return await send(await buildHandshakeBody(job, wireCues, signal));
      } catch (fallbackError) {
        onLog?.(`Network request failed: ${describe(fallbackError)}`);
        throw fallbackError;
      }
    }
    onLog?.(`Network request failed: ${describe(error)}`);
    throw error;
  }
}

export function postTranslateJob(job: TranslateJobPayload, callbacks: JobCallbacks = {}): Promise<TranslateJobResponse> {
  return withRetry(() => attemptTranslateJob(job, callbacks), callbacks.signal);
}
