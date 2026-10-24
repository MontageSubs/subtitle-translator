interface QueuedDeletion {
  deadline: number;
  timer: number;
}

const queue = new Map<string, QueuedDeletion>();
const listeners = new Set<() => void>();

export const DELETION_UNDO_WINDOW_MS = 5000;

export const CLEAR_ALL_KEY = "history:all";

export const jobDeletionKey = (jobId: string): string => `history:job:${jobId}`;

export function queueDeletion(key: string, delayMs: number, commit: () => Promise<unknown>): void {
  cancelDeletion(key);
  const timer = window.setTimeout(() => {
    void commit()
      .catch(() => undefined)
      .finally(() => {
        queue.delete(key);
        listeners.forEach((listener) => listener());
      });
  }, delayMs);
  queue.set(key, { deadline: Date.now() + delayMs, timer });
}

export function cancelDeletion(key: string): boolean {
  const entry = queue.get(key);
  if (!entry) return false;
  window.clearTimeout(entry.timer);
  queue.delete(key);
  return true;
}

export const isDeletionQueued = (key: string): boolean => queue.has(key);

export const deletionRemainingMs = (key: string): number => Math.max(0, (queue.get(key)?.deadline ?? 0) - Date.now());

export function subscribeDeletionSettled(listener: () => void, signal: AbortSignal): void {
  listeners.add(listener);
  signal.addEventListener("abort", () => listeners.delete(listener), { once: true });
}
