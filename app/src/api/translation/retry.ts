import { activeAccessBlock, rememberAccessBlock } from "./access";
import { resolveTurnstile } from "./captcha";
import { WorkerRequestError, abortError } from "./errors";
import { discardClearance } from "./tokens";

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

async function waitForCooldown(signal?: AbortSignal): Promise<void> {
  const remaining = cooldownUntil - Date.now();
  if (remaining > 0) await sleep(remaining, signal);
}

function noteRateLimited(): void {
  cooldownUntil = Date.now() + backoffMs;
  backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
}

function noteRateLimitCleared(): void {
  backoffMs = BASE_BACKOFF_MS;
}

export async function withRetry<T>(attempt: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  const blockedUntil = activeAccessBlock();
  if (blockedUntil) throw new WorkerRequestError("access blocked", { code: "access_blocked", retryAt: blockedUntil });
  await waitForCooldown(signal);
  try {
    const result = await attempt();
    noteRateLimitCleared();
    return result;
  } catch (error) {
    if (signal?.aborted || !(error instanceof WorkerRequestError)) throw error;
    if (error.retryAt) {
      rememberAccessBlock(error.retryAt);
      throw error;
    }
    if (error.triggerTurnstile) {
      discardClearance();
      await resolveTurnstile(error.quota);
    } else if (error.retryable && !error.partialResult) {
      noteRateLimited();
    } else {
      throw error;
    }
    await waitForCooldown(signal);
    return attempt();
  }
}
