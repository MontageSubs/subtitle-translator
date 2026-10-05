import { computeProofVector } from "../../utils/envProbe";
import { joinCueLines } from "../../lib/subtitle/extraction/styleWraps";
import { computeAnswer, computeRequestDigest } from "./challenge";
import { currentClearance } from "./clearance";
import { WorkerRequestError } from "./errors";
import { withRetry } from "./retry";
import { adoptSession, takeSession } from "./session";
import { postStream } from "./stream";
import { isTokenFresh } from "./tokens";
import type { JobCallbacks, TranslateJobPayload, TranslateJobResponse, WorkerSessionPayload } from "./types";

async function buildHandshakeBody(job: TranslateJobPayload, wireCues: Pick<TranslateJobPayload["cues"][number], "id" | "start_ms" | "end_ms" | "text">[], signal?: AbortSignal): Promise<Record<string, unknown>> {
  const active = await takeSession(signal);
  const proof = await computeProofVector(active.nonce, active.recipe).catch(() => undefined);
  const digest = computeRequestDigest(job.source, job.target, job.glossary, wireCues);
  const proofCommitment = proof ? proof.transcript[proof.transcript.length - 1] : NaN;
  const answer = await computeAnswer(active.challengeKey, active.nonce, digest, proofCommitment);
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
  const send = async (body: Record<string, unknown>): Promise<TranslateJobResponse> => {
    const result = await postStream("/translate-job", body, wireCues, { onLog, onProgress, onSession: (payload) => adoptSession(payload) }, signal);
    const issued = result as unknown as Partial<WorkerSessionPayload>;
    if (issued.token && issued.challengeKey) adoptSession(issued as WorkerSessionPayload);
    return result;
  };
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
