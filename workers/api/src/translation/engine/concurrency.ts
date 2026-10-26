import { remainingBudgetMs } from "../../config/timing";

export async function runPool<T>(
  items: readonly T[],
  limit: number,
  task: (item: T, index: number) => Promise<void>,
  signal?: AbortSignal
): Promise<void> {
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      if (signal?.aborted) {
        cursor = items.length;
        break;
      }
      const index = cursor++;
      try {
        await task(items[index]!, index);
      } catch (error) {
        if (signal?.aborted) {
          cursor = items.length;
          break;
        }
        throw error;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

export function deadlineSignal(startedAt: number, clientSignal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(remainingBudgetMs(startedAt));
  if (!clientSignal) return timeout;
  if (clientSignal.aborted) return clientSignal;
  if ("any" in AbortSignal && typeof AbortSignal.any === "function") {
    return AbortSignal.any([timeout, clientSignal]);
  }
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  timeout.addEventListener("abort", onAbort, { once: true });
  clientSignal.addEventListener("abort", onAbort, { once: true });
  return controller.signal;
}

export const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
