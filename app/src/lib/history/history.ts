import { SubtitleFormat, OutputMode, BilingualStacking, Glossary } from '../../utils/types';
import { SourceFormat } from '../../utils/encoding';
import { buildTranslatedFilename } from '../subtitle/subtitleFormat';

export type TranslationEngine = "nmt" | "llm";

export interface HistoryCue {
  id: number;
  start_ms: number;
  end_ms: number;
  sourceText: string;
  translatedText: string;
  cueSettings?: string;
  originalSdh?: string;
  sceneIndex?: number;
  extra?: Record<string, unknown>;
}

export interface HistorySubtitle {
  id: string;
  sourceFilename?: string;
  translatedFilename?: string;
  filename: string;
  format: SubtitleFormat;
  outputMode: OutputMode;
  stacking: BilingualStacking;
  cues: HistoryCue[];
  sourceFormat?: SourceFormat;
  relativePath?: string;
  rawHeader?: string;
  rawStyles?: string;
  template?: string;
  extra?: Record<string, unknown>;
}

export interface HistoryJob {
  id: string;
  historyId?: string;
  engine: TranslationEngine;
  provider?: string;
  title: string;
  sourceFilename?: string;
  translatedFilename?: string;
  sourceLang: string;
  targetLang: string;
  subtitles: HistorySubtitle[];
  glossary?: Glossary;
  contextText?: string;
  caseSensitiveTerms?: boolean;
  stripSdh?: boolean;
  sceneSeconds?: number;
  createdAt: number;
  updatedAt: number;
  extra?: Record<string, unknown>;
}

export type HistoryEntry = HistoryJob;

const HISTORY_ID_KEY = "subtitle_translator_history_id";

export function getHistoryId(): string | null {
  return localStorage.getItem(HISTORY_ID_KEY);
}

export function ensureHistoryId(): string {
  let id = localStorage.getItem(HISTORY_ID_KEY);
  if (!id) {
    id = typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(HISTORY_ID_KEY, id);
  }
  return id;
}

const DB_NAME = "subtitle-translator-history";
const DB_VERSION = 2;
const STORE_NAME = "jobs";
const MAX_ENTRIES = 100;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = request.result;
      const oldVersion = event.oldVersion;
      if (oldVersion < 1) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" }).createIndex("createdAt", "createdAt");
      } else if (oldVersion === 1) {
        if (db.objectStoreNames.contains("entries") && !db.objectStoreNames.contains(STORE_NAME)) {
          const oldStore = (request.transaction as IDBTransaction).objectStore("entries");
          const newStore = db.createObjectStore(STORE_NAME, { keyPath: "id" });
          newStore.createIndex("createdAt", "createdAt");
          oldStore.openCursor().onsuccess = (e) => {
            const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
            if (cursor) {
              newStore.add(normalizeHistoryJob(cursor.value));
              cursor.continue();
            }
          };
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function runRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getStore(mode: IDBTransactionMode): Promise<IDBObjectStore> {
  const db = await openDb();
  return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
}

export function normalizeHistoryJob(raw: any): HistoryJob {
  const historyId = raw.historyId || raw.deviceId || raw.originDeviceId || undefined;
  const provider = raw.provider || "Google";
  const sourceLang = raw.sourceLang || "en";
  const targetLang = raw.targetLang || "zh";

  const sourceFilename = raw.sourceFilename || raw.subtitles?.[0]?.sourceFilename || raw.currentFilename || "subtitle.srt";
  const format = raw.subtitles?.[0]?.format || raw.format || "srt";
  const outputMode = raw.subtitles?.[0]?.outputMode || raw.outputMode || "monolingual";
  const stacking = raw.subtitles?.[0]?.stacking || raw.stacking || "translation_top";

  const translatedFilename = raw.translatedFilename || raw.subtitles?.[0]?.translatedFilename || raw.downloadFilename || buildTranslatedFilename(sourceFilename, format, sourceLang, targetLang, outputMode, stacking);

  if (raw.subtitles && Array.isArray(raw.subtitles)) {
    const subtitles = raw.subtitles.map((sub: any) => ({
      ...sub,
      sourceFilename: sub.sourceFilename || sourceFilename,
      translatedFilename: sub.translatedFilename || translatedFilename,
      filename: sub.translatedFilename || sub.filename || translatedFilename,
    }));
    return {
      ...raw,
      historyId,
      provider,
      sourceFilename,
      translatedFilename,
      subtitles,
    } as HistoryJob;
  }
  const sub: HistorySubtitle = {
    id: raw.id || `${raw.createdAt || Date.now()}-sub`,
    sourceFilename,
    translatedFilename,
    filename: translatedFilename,
    format,
    outputMode,
    stacking,
    cues: raw.cues || [],
  };
  return {
    id: raw.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    historyId,
    engine: raw.engine || "nmt",
    provider,
    title: translatedFilename,
    sourceFilename,
    translatedFilename,
    sourceLang,
    targetLang,
    subtitles: [sub],
    glossary: raw.glossary,
    contextText: raw.contextText,
    caseSensitiveTerms: raw.caseSensitiveTerms,
    stripSdh: raw.stripSdh,
    sceneSeconds: raw.sceneSeconds,
    createdAt: raw.createdAt || Date.now(),
    updatedAt: raw.updatedAt || Date.now(),
  };
}

async function pruneOverflow(): Promise<void> {
  const store = await getStore("readwrite");
  const total = await runRequest(store.count());
  if (total <= MAX_ENTRIES) return;
  const index = store.index("createdAt");
  let overflow = total - MAX_ENTRIES;
  const cursorRequest = index.openCursor();
  await new Promise<void>((resolve, reject) => {
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor || overflow <= 0) return resolve();
      cursor.delete();
      overflow -= 1;
      cursor.continue();
    };
    cursorRequest.onerror = () => reject(cursorRequest.error);
  });
}

export async function saveHistoryJob(job: Omit<HistoryJob, "id" | "createdAt" | "updatedAt"> & { id?: string }): Promise<string> {
  const now = Date.now();
  const id = job.id || `${now}-${Math.random().toString(36).slice(2, 8)}`;
  const record: HistoryJob = {
    ...job,
    id,
    historyId: job.historyId || ensureHistoryId(),
    provider: job.provider || "Google",
    createdAt: now,
    updatedAt: now,
  };
  const store = await getStore("readwrite");
  await runRequest(store.put(record));
  await pruneOverflow();
  return record.id;
}

export async function saveHistoryEntry(legacy: any): Promise<string> {
  const normalized = normalizeHistoryJob(legacy);
  return saveHistoryJob(normalized);
}

export async function getHistoryJob(id: string): Promise<HistoryJob | undefined> {
  const store = await getStore("readonly");
  const raw = await runRequest(store.get(id) as IDBRequest<any>);
  return raw ? normalizeHistoryJob(raw) : undefined;
}

export async function getHistoryEntry(id: string): Promise<HistoryEntry | undefined> {
  return getHistoryJob(id);
}

export async function updateHistoryJob(id: string, partial: Partial<Omit<HistoryJob, "id" | "createdAt">>): Promise<HistoryJob | undefined> {
  const existing = await getHistoryJob(id);
  if (!existing) return undefined;
  const updated: HistoryJob = { ...existing, ...partial, updatedAt: Date.now() };
  const store = await getStore("readwrite");
  await runRequest(store.put(updated));
  return updated;
}

export async function updateHistoryEntry(id: string, partial: any): Promise<HistoryEntry | undefined> {
  return updateHistoryJob(id, partial);
}

export async function listHistoryJobs(): Promise<HistoryJob[]> {
  const store = await getStore("readonly");
  const entries = await runRequest(store.getAll() as IDBRequest<any[]>);
  return entries.map(normalizeHistoryJob).sort((a, b) => b.createdAt - a.createdAt);
}

export async function listLocalHistoryJobs(): Promise<HistoryJob[]> {
  const all = await listHistoryJobs();
  const currentHistoryId = getHistoryId();
  if (!currentHistoryId) {
    return all.filter((j) => !j.historyId);
  }
  return all.filter((j) => !j.historyId || j.historyId === currentHistoryId);
}

export async function listHistoryEntries(): Promise<HistoryEntry[]> {
  return listHistoryJobs();
}

export async function deleteHistoryJob(id: string): Promise<void> {
  const store = await getStore("readwrite");
  await runRequest(store.delete(id));
}

export async function deleteHistoryEntry(id: string): Promise<void> {
  return deleteHistoryJob(id);
}

export async function clearHistory(): Promise<void> {
  const store = await getStore("readwrite");
  await runRequest(store.clear());
  localStorage.removeItem(HISTORY_ID_KEY);
}

export async function exportHistoryJson(): Promise<string> {
  const jobs = await listHistoryJobs();
  const currentHistoryId = getHistoryId();
  return JSON.stringify({ version: 2, historyId: currentHistoryId, exportedAt: Date.now(), jobs }, null, 2);
}

export async function importHistoryJson(jsonStr: string): Promise<{ imported: number; updated: number }> {
  const parsed = JSON.parse(jsonStr);
  const items: any[] = Array.isArray(parsed) ? parsed : (parsed.jobs || parsed.entries || []);
  const sourceHistoryId: string | undefined = parsed.historyId || parsed.deviceId;
  if (!Array.isArray(items)) throw new Error("Invalid history backup format");

  ensureHistoryId();

  let imported = 0;
  let updated = 0;
  const store = await getStore("readwrite");

  for (const item of items) {
    const job = normalizeHistoryJob(item);
    if (!job.historyId && sourceHistoryId) {
      job.historyId = sourceHistoryId;
    }
    const existing = await runRequest(store.get(job.id) as IDBRequest<any>);
    if (existing) {
      if ((job.updatedAt || 0) >= (existing.updatedAt || 0)) {
        await runRequest(store.put(job));
        updated++;
      }
    } else {
      await runRequest(store.add(job));
      imported++;
    }
  }

  await pruneOverflow();
  return { imported, updated };
}
