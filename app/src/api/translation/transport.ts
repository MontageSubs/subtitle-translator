import { reportNetworkFailure } from "../../lib/net/serviceReachability";
import { REQUEST_TIMEOUT_MS, assertConfigured } from "../../config/environment";
import { currentEndpoint, recordEndpoints, recordNetworkFailure, recordNetworkSuccess } from "./endpoints";
import { CLIENT_LABEL } from "../../config/compat";
import { ALLOWANCE_EXHAUSTED_CODE, WORKER_LIMIT_ERROR_CODE, WorkerRequestError, abortError } from "./errors";
import { discountClock } from "./idleClock";
import type { QuotaHint, WorkerErrorPayload } from "./types";
import { lastStatusField, recordInteractionFailure, recordInteractionSuccess } from "./lastStatus";
import { noteWorkerLimit } from "./workerCooldown";
import { noteAllowanceExhausted } from "./channel";

export interface Deadline {
  readonly signal: AbortSignal;
  timedOut(): boolean;
  release(): void;
}

function parseRetryAt(value: unknown): number | undefined {
  const timestamp = typeof value === "number" ? value : typeof value === "string" ? Date.parse(value) : NaN;
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : undefined;
}

function parseQuotaHint(value: unknown): QuotaHint | undefined {
  const { window, percent } = (value ?? {}) as Partial<QuotaHint>;
  return (window === "hour" || window === "day") && Number.isFinite(percent) ? { window, percent: Math.round(percent!) } : undefined;
}

function forfeitDeadAttempt(error: unknown, startedAt: number): void {
  if (error instanceof WorkerRequestError && (error.code === "timeout" || error.code === "network_error") && !error.partialResult?.cues?.length) discountClock(performance.now() - startedAt);
}

function startDeadline(external?: AbortSignal): Deadline {
  if (external?.aborted) throw abortError();
  const controller = new AbortController();
  let expired = false;
  const timer = setTimeout(() => {
    expired = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);
  const forwardAbort = () => controller.abort();
  external?.addEventListener("abort", forwardAbort, { once: true });
  return {
    signal: controller.signal,
    timedOut: () => expired,
    release() {
      clearTimeout(timer);
      external?.removeEventListener("abort", forwardAbort);
    },
  };
}

export async function postText(path: string, body: Record<string, unknown>, deadline: Deadline, external?: AbortSignal): Promise<Response> {
  try {
    const response = await fetch(`${currentEndpoint()}${path}`, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify({ ...body, ...lastStatusField(), clientVersion: CLIENT_LABEL }),
      signal: deadline.signal,
    });
    recordNetworkSuccess();
    return response;
  } catch (error) {
    if (external?.aborted) throw abortError();
    if (deadline.timedOut()) throw new WorkerRequestError("Request timed out", { code: "timeout" });
    recordNetworkFailure();
    reportNetworkFailure(currentEndpoint(), error);
    throw new WorkerRequestError(error instanceof Error && error.message ? error.message : "Failed to fetch", { retryable: true, code: "network_error" });
  }
}

export function recordResponseFailure(response: Response, payload: WorkerErrorPayload | undefined): WorkerRequestError {
  const { status } = response;
  const workerLimit = status === 503 && payload?.error === undefined;
  const code: string | undefined = workerLimit ? "worker_limit" : payload?.error;
  const fatal = code === "output_blocked";
  const capacity = code === "capacity_exceeded" || code === "quota_exceeded" || code === "access_blocked" || code === ALLOWANCE_EXHAUSTED_CODE;
  const message = fatal ? "Translation blocked by provider" : workerLimit ? `error=${WORKER_LIMIT_ERROR_CODE}` : code || `worker responded ${status}`;
  if (workerLimit) noteWorkerLimit();
  if (code === ALLOWANCE_EXHAUSTED_CODE) noteAllowanceExhausted();
  return new WorkerRequestError(message, {
    retryable: !fatal && !capacity && !workerLimit && (status === 401 || status === 429 || status >= 500),
    captchaRequired: !capacity && (status === 429 || Boolean(payload?.captcha_required)),
    fatal,
    capacity,
    code,
    retryAt: parseRetryAt(payload?.retry_at),
    quota: parseQuotaHint(payload?.quota),
    minClientVersion: payload?.min_client_version,
  });
}

export async function runInteraction<T>(external: AbortSignal | undefined, run: (deadline: Deadline) => Promise<T>): Promise<T> {
  assertConfigured();
  const deadline = startDeadline(external);
  const startedAt = performance.now();
  try {
    const value = await run(deadline);
    recordInteractionSuccess();
    return value;
  } catch (error) {
    forfeitDeadAttempt(error, startedAt);
    recordInteractionFailure(error);
    throw error;
  } finally {
    deadline.release();
  }
}

export function postJson(path: string, body: Record<string, unknown>, external?: AbortSignal): Promise<any> {
  return runInteraction(external, async (deadline) => {
    const response = await postText(path, body, deadline, external);
    const payload = await response.json().catch(() => ({}));
    recordEndpoints(payload);
    if (!response.ok) throw recordResponseFailure(response, payload);
    return payload;
  });
}
