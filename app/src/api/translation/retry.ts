import { resolveTurnstile } from "./captcha";
import { discardClearance } from "./clearance";
import { WorkerRequestError } from "./errors";
import { noteRateLimitCleared, noteRateLimited, waitForCooldown } from "./rateLimit";

export async function withRetry<T>(attempt: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  await waitForCooldown(signal);
  try {
    const result = await attempt();
    noteRateLimitCleared();
    return result;
  } catch (error) {
    if (signal?.aborted || !(error instanceof WorkerRequestError)) throw error;
    if (error.triggerTurnstile) {
      discardClearance();
      await resolveTurnstile();
    } else if (error.retryable && !error.partialResult) {
      noteRateLimited();
    } else {
      throw error;
    }
    await waitForCooldown(signal);
    return attempt();
  }
}
