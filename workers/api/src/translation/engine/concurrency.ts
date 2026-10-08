import { remainingBudgetMs } from "../../config/timing";

export async function runPool<T>(items: readonly T[], limit: number, task: (item: T, index: number) => Promise<void>): Promise<void> {
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await task(items[index]!, index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

export const deadlineSignal = (startedAt: number): AbortSignal => AbortSignal.timeout(remainingBudgetMs(startedAt));

export const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
