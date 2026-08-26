import { SubtitleFormat, OutputMode, BilingualStacking, Glossary } from "./types";

export type TranslationEngine = "nmt" | "llm";

export interface HistoryCue {
  id: number;
  start_ms: number;
  end_ms: number;
  sourceText: string;
  translatedText: string;
  cueSettings?: string;
}

export interface HistoryEntry {
  id: string;
  engine: TranslationEngine;
  filename: string;
  sourceLang: string;
  targetLang: string;
  format: SubtitleFormat;
  outputMode: OutputMode;
  stacking: BilingualStacking;
  cues: HistoryCue[];
  glossary?: Glossary;
  contextText?: string;
  caseSensitiveTerms?: boolean;
  stripSdh?: boolean;
  sceneSeconds?: number;
  createdAt: number;
  updatedAt: number;
}

const DB_NAME = "subtitle-translator-history";
const DB_VERSION = 1;
const STORE_NAME = "entries";
const MAX_ENTRIES = 50;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME, { keyPath: "id" }).createIndex("createdAt", "createdAt");
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

export async function saveHistoryEntry(entry: Omit<HistoryEntry, "id" | "createdAt" | "updatedAt">): Promise<string> {
  const now = Date.now();
  const record: HistoryEntry = { ...entry, id: `${now}-${Math.random().toString(36).slice(2, 8)}`, createdAt: now, updatedAt: now };
  const store = await getStore("readwrite");
  await runRequest(store.add(record));
  await pruneOverflow();
  return record.id;
}

export async function getHistoryEntry(id: string): Promise<HistoryEntry | undefined> {
  const store = await getStore("readonly");
  return runRequest(store.get(id) as IDBRequest<HistoryEntry | undefined>);
}

export async function updateHistoryEntry(id: string, partial: Partial<Omit<HistoryEntry, "id" | "createdAt" | "updatedAt">>): Promise<HistoryEntry | undefined> {
  const existing = await getHistoryEntry(id);
  if (!existing) return undefined;
  const updated: HistoryEntry = { ...existing, ...partial, updatedAt: Date.now() };
  const store = await getStore("readwrite");
  await runRequest(store.put(updated));
  return updated;
}

export async function listHistoryEntries(): Promise<HistoryEntry[]> {
  const store = await getStore("readonly");
  const entries = await runRequest(store.getAll() as IDBRequest<HistoryEntry[]>);
  return entries.sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteHistoryEntry(id: string): Promise<void> {
  const store = await getStore("readwrite");
  await runRequest(store.delete(id));
}

export async function clearHistory(): Promise<void> {
  const store = await getStore("readwrite");
  await runRequest(store.clear());
}
