import { STORAGE_KEYS } from "../../config/storage";
import { persistentStorage } from "../../utils/safeStorage";

export const awaitingDownloadId = (): string | null => persistentStorage.getItem(STORAGE_KEYS.historyAwaitingDownload);

export const markAwaitingDownload = (jobId: string): void => persistentStorage.setItem(STORAGE_KEYS.historyAwaitingDownload, jobId);

export function settleDownload(jobId: string | null): void {
  if (jobId && awaitingDownloadId() === jobId) persistentStorage.removeItem(STORAGE_KEYS.historyAwaitingDownload);
}
