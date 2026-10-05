import { WORKER_URL, REQUEST_TIMEOUT_MS, assertConfigured } from "../../config/config";
import { WorkerRequestError, abortError, localizedErrorMessage } from "./errors";
import type { WorkerErrorPayload } from "./types";

export interface Deadline {
  readonly signal: AbortSignal;
  timedOut(): boolean;
  release(): void;
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

export async function postText(path: string, body: unknown, deadline: Deadline, external?: AbortSignal): Promise<Response> {
  try {
    return await fetch(`${WORKER_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify(body),
      signal: deadline.signal,
    });
  } catch (error) {
    if (external?.aborted) throw abortError();
    if (deadline.timedOut()) throw new WorkerRequestError("Request timed out", { code: "timeout" });
    throw new WorkerRequestError(error instanceof Error && error.message ? error.message : "Failed to fetch", { retryable: true, code: "network_error" });
  }
}

export function failureFromResponse(response: Response, payload: WorkerErrorPayload | undefined, messageFor: (code: string | undefined, status: number) => string): WorkerRequestError {
  const code: string | undefined = payload?.error;
  const fatal = code === "output_blocked";
  const capacity = code === "capacity_exceeded";
  const { status } = response;
  const message = fatal ? "Translation blocked by provider" : messageFor(code, status);
  return new WorkerRequestError(message, {
    retryable: !fatal && !capacity && (status === 401 || status === 429 || status >= 500),
    triggerTurnstile: status === 429 || Boolean(payload?.trigger_turnstile),
    fatal,
    capacity,
    code,
  });
}

export async function postJson(path: string, body: unknown, external?: AbortSignal): Promise<any> {
  assertConfigured();
  const deadline = startDeadline(external);
  try {
    const response = await postText(path, body, deadline, external);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw failureFromResponse(response, payload, (code, status) => localizedErrorMessage(code, `worker responded ${status}`));
    return payload;
  } finally {
    deadline.release();
  }
}
