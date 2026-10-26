import { STORAGE_KEYS } from "../../config/storage";
import { persistentStorage } from "../../utils/safeStorage";
import { createId } from "../../utils/id";
import { touchesBody } from "./historySchema";
import { clearJobs, deleteJob, getHead, getJob, listHeads, putHead, putJob } from "./historyStore";
import type { HistoryJob, HistorySummary } from "./historyTypes";

export type { HistoryCue, HistoryJob, HistoryJobBody, HistoryJobHead, HistorySubtitle, HistorySummary, TranslationEngine } from "./historyTypes";

export type NewHistoryJob = Omit<HistoryJob, "id" | "createdAt" | "updatedAt"> & { id?: string };


let writeQueue: Promise<unknown> = Promise.resolve();

export function serializeWrite<T>(task: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(task, task);
  writeQueue = result.catch(() => {});
  return result;
}

export function getHistoryId(): string | null {
  return persistentStorage.getItem(STORAGE_KEYS.historyId);
}

export function ensureHistoryId(): string {
  let id = persistentStorage.getItem(STORAGE_KEYS.historyId);
  if (!id) {
    id = crypto.randomUUID?.() ?? createId();
    persistentStorage.setItem(STORAGE_KEYS.historyId, id);
  }
  return id;
}

export async function saveHistoryJob(job: NewHistoryJob): Promise<string> {
  const now = Date.now();
  const record: HistoryJob = {
    ...job,
    id: job.id || createId(),
    historyId: job.historyId || ensureHistoryId(),
    provider: job.provider || "Google",
    createdAt: now,
    updatedAt: now,
  };
  await serializeWrite(() => putJob(record));
  return record.id;
}

export const getHistoryJob = (id: string): Promise<HistoryJob | undefined> => getJob(id);

export function updateHistoryJob(id: string, partial: Partial<Omit<HistoryJob, "id" | "createdAt">>): Promise<number | undefined> {
  return serializeWrite(async () => {
    const updatedAt = Date.now();
    if (touchesBody(partial)) {
      const current = await getJob(id);
      if (!current) return undefined;
      await putJob({ ...current, ...partial, updatedAt });
      return updatedAt;
    }
    const head = await getHead(id);
    if (!head) return undefined;
    await putHead({ ...head, ...partial, updatedAt });
    return updatedAt;
  });
}

export const listHistorySummaries = (): Promise<HistorySummary[]> => listHeads();

export async function countHistoryJobs(): Promise<number> {
  return (await listHeads()).length;
}

export async function countLocalHistoryJobs(): Promise<number> {
  const currentHistoryId = getHistoryId();
  return (await listHeads()).filter((head) => !head.historyId || head.historyId === currentHistoryId).length;
}

export function deleteHistoryJob(id: string): Promise<void> {
  return serializeWrite(() => deleteJob(id));
}

export async function clearHistory(): Promise<void> {
  await serializeWrite(clearJobs);
  persistentStorage.removeItem(STORAGE_KEYS.historyId);
}
