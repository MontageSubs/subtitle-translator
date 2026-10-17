import { persistentStorage } from '../../utils/safeStorage';
import { SubtitleFormat, OutputMode, BilingualStacking, CueLayout, Glossary } from '../subtitle/types';
import { SourceFormat } from '../subtitle/extraction/encoding';
import { TopAlign, AnCornerOrDefault } from '../subtitle/formats/topAlign';
import { CueMeta } from '../subtitle/formats/cueMeta';
import { createId } from '../../utils/id';
import { announceUpdateIfAvailable } from '../../update/updateWatcher';
import { HISTORY_SCHEMA, isReadableJob, schemaOf } from './historySchema';

export type TranslationEngine = "nmt" | "llm";

export interface HistoryCue {
  id: number;
  start_ms: number;
  end_ms: number;
  sourceText: string;
  translatedText: string;
  topAlign?: TopAlign;
  is_music?: boolean;
  verbatim?: boolean;
  topAlignOverride?: AnCornerOrDefault;
  position?: string;
  cueSettings?: string;
  originalSdh?: string;
  sceneIndex?: number;
  extra?: CueMeta & { position?: string };
}

export interface HistorySubtitle {
  id: string;
  sourceFilename?: string;
  translatedFilename?: string;
  filename: string;
  format: SubtitleFormat;
  outputMode: OutputMode;
  stacking: BilingualStacking;
  musicTopAlign?: boolean;
  cueLayout?: CueLayout;
  credit?: boolean;
  cues: HistoryCue[];
  sourceFormat?: SourceFormat;
  originFormat?: SubtitleFormat;
  sourceLayout?: string;
  relativePath?: string;
  rawHeader?: string;
  rawStyles?: string;
  template?: string;
  extra?: Record<string, unknown>;
}

export interface HistoryJob {
  id: string;
  schema?: number;
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
  skipLyrics?: boolean;
  fullWidthPunctuation?: boolean;
  keepTerminalPunctuation?: boolean;
  sceneSeconds?: number;
  elapsedMs?: number;
  createdAt: number;
  updatedAt: number;
  extra?: Record<string, unknown>;
}

const HISTORY_ID_KEY = "subtitle-translator:history-id";

export function getHistoryId(): string | null {
  return persistentStorage.getItem(HISTORY_ID_KEY);
}

function ensureHistoryId(): string {
  let id = persistentStorage.getItem(HISTORY_ID_KEY);
  if (!id) {
    id = crypto.randomUUID?.() ?? createId();
    persistentStorage.setItem(HISTORY_ID_KEY, id);
  }
  return id;
}

const DB_NAME = "subtitle-translator:history";
const DB_VERSION = 2;
const STORE_NAME = "jobs";
const MAX_ENTRIES = 100;

let connection: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME, { keyPath: "id" }).createIndex("createdAt", "createdAt");
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        connection = null;
      };
      resolve(db);
    };
    request.onerror = () => {
      connection = null;
      if (request.error?.name === "VersionError") void announceUpdateIfAvailable();
      reject(request.error);
    };
  });
  return connection;
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
  const record: HistoryJob = {
    ...job,
    schema: HISTORY_SCHEMA,
    id: job.id || createId(),
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

export async function getHistoryJob(id: string): Promise<HistoryJob | undefined> {
  const store = await getStore("readonly");
  const raw = await runRequest(store.get(id) as IDBRequest<any>);
  return isReadableJob(raw) ? raw : undefined;
}

export async function updateHistoryJob(id: string, partial: Partial<Omit<HistoryJob, "id" | "createdAt">>): Promise<HistoryJob | undefined> {
  const store = await getStore("readwrite");
  const raw = await runRequest(store.get(id) as IDBRequest<any>);
  if (!isReadableJob(raw)) return undefined;
  const updated: HistoryJob = { ...raw, ...partial, updatedAt: Date.now() };
  await runRequest(store.put(updated));
  return updated;
}

export async function listHistoryJobs(): Promise<HistoryJob[]> {
  const store = await getStore("readonly");
  const entries = await runRequest(store.getAll() as IDBRequest<any[]>);
  return entries.filter(isReadableJob).sort((a, b) => b.createdAt - a.createdAt);
}

export async function listLocalHistoryJobs(): Promise<HistoryJob[]> {
  const currentHistoryId = getHistoryId();
  return (await listHistoryJobs()).filter((job) => !job.historyId || job.historyId === currentHistoryId);
}

export async function deleteHistoryJob(id: string): Promise<void> {
  const store = await getStore("readwrite");
  await runRequest(store.delete(id));
}

export async function clearHistory(): Promise<void> {
  const store = await getStore("readwrite");
  await runRequest(store.clear());
  persistentStorage.removeItem(HISTORY_ID_KEY);
}

export async function exportHistoryJson(): Promise<string> {
  const jobs = await listHistoryJobs();
  const currentHistoryId = getHistoryId();
  return JSON.stringify({ schema: HISTORY_SCHEMA, historyId: currentHistoryId, exportedAt: Date.now(), jobs }, null, 2);
}

export async function importHistoryJson(jsonStr: string): Promise<{ imported: number; updated: number; unreadable: number }> {
  const parsed = JSON.parse(jsonStr);
  const items: unknown = parsed?.jobs;
  const sourceHistoryId: string | undefined = parsed.historyId;
  if (!Array.isArray(items)) throw new Error("Invalid history backup format");

  ensureHistoryId();

  let imported = 0;
  let updated = 0;
  let unreadable = 0;
  const store = await getStore("readwrite");

  for (const job of items) {
    if (!isReadableJob(job)) {
      if (schemaOf(job) > HISTORY_SCHEMA) unreadable++;
      continue;
    }
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
  return { imported, updated, unreadable };
}
