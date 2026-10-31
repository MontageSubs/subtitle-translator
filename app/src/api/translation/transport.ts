import { REQUEST_TIMEOUT_MS, assertConfigured } from "../../config/environment";
import { currentEndpoint, recordEndpoints, recordNetworkFailure, recordNetworkSuccess } from "./endpoints";
import { APP_VERSION } from "../../config/compat";
import { WorkerRequestError, abortError } from "./errors";
import type { QuotaHint, WorkerErrorPayload } from "./types";

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

export function startDeadline(external?: AbortSignal): Deadline {
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
      body: JSON.stringify({ ...body, clientVersion: APP_VERSION }),
      signal: deadline.signal,
    });
    recordNetworkSuccess();
    return response;
  } catch (error) {
    if (external?.aborted) throw abortError();
    if (deadline.timedOut()) throw new WorkerRequestError("Request timed out", { code: "timeout" });
    recordNetworkFailure();
    throw new WorkerRequestError(error instanceof Error && error.message ? error.message : "Failed to fetch", { retryable: true, code: "network_error" });
  }
}

export function failureFromResponse(response: Response, payload: WorkerErrorPayload | undefined): WorkerRequestError {
  const code: string | undefined = payload?.error;
  const fatal = code === "output_blocked";
  const capacity = code === "capacity_exceeded" || code === "quota_exceeded" || code === "access_blocked";
  const { status } = response;
  const message = fatal ? "Translation blocked by provider" : code || `worker responded ${status}`;
  return new WorkerRequestError(message, {
    retryable: !fatal && !capacity && (status === 401 || status === 429 || status >= 500),
    triggerTurnstile: !capacity && (status === 429 || Boolean(payload?.trigger_turnstile)),
    fatal,
    capacity,
    code,
    retryAt: parseRetryAt(payload?.retry_at),
    quota: parseQuotaHint(payload?.quota),
    minClientVersion: payload?.min_client_version,
  });
}

export async function postJson(path: string, body: Record<string, unknown>, external?: AbortSignal): Promise<any> {
  assertConfigured();
  const deadline = startDeadline(external);
  try {
    const response = await postText(path, body, deadline, external);
    const payload = await response.json().catch(() => ({}));
    recordEndpoints(payload);
    if (!response.ok) throw failureFromResponse(response, payload);
    return payload;
  } finally {
    deadline.release();
  }
}
