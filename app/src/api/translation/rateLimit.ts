import { abortError } from "./errors";

const BASE_BACKOFF_MS = 5_000;
const MAX_BACKOFF_MS = 60_000;

let cooldownUntil = 0;
let backoffMs = BASE_BACKOFF_MS;

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function waitForCooldown(signal?: AbortSignal): Promise<void> {
  const remaining = cooldownUntil - Date.now();
  if (remaining > 0) await sleep(remaining, signal);
}

export function noteRateLimited(): void {
  cooldownUntil = Date.now() + backoffMs;
  backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
}

export function noteRateLimitCleared(): void {
  backoffMs = BASE_BACKOFF_MS;
}
