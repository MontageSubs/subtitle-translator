import { RECOGNITION_DATABASE_NAME } from "../../config/storage";
import type { CollectorSnapshot } from "./candidates";
import type { SequentialSnapshot } from "./knowledge/sequence";
import type { ScanSnapshot } from "./planning/scan";
import type { RecognitionUnit } from "./units";

export interface RecognitionCheckpoint {
  schema: 1;
  fingerprint: string;
  depth: number;
  scan: ScanSnapshot;
  sequential: SequentialSnapshot;
  collector: CollectorSnapshot;
  pending: string[];
  translations: Record<string, Record<string, string>>;
  savedAt: number;
}

const STORE_NAME = "checkpoints";
const CURRENT_KEY = "current";
const DATABASE_VERSION = 1;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CHECKPOINT_BYTES = 4 * 1024 * 1024;
const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

export function hashUnits(units: readonly RecognitionUnit[]): string {
  let hash = FNV_OFFSET;
  for (const { text: unit } of units) {
    for (let index = 0; index < unit.length; index++) hash = Math.imul(hash ^ unit.charCodeAt(index), FNV_PRIME);
    hash = Math.imul(hash ^ 0x0a, FNV_PRIME);
  }
  return (hash >>> 0).toString(36);
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(RECOGNITION_DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = operation(database.transaction(STORE_NAME, mode).objectStore(STORE_NAME));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}

export async function clearCheckpoint(): Promise<void> {
  try {
    await withStore("readwrite", (store) => store.delete(CURRENT_KEY));
  } catch {
    return;
  }
}

export async function loadCheckpoint(fingerprint: string): Promise<RecognitionCheckpoint | null> {
  try {
    const stored = await withStore<RecognitionCheckpoint | undefined>("readonly", (store) => store.get(CURRENT_KEY));
    if (!stored) return null;
    if (Date.now() - stored.savedAt > MAX_AGE_MS) {
      await clearCheckpoint();
      return null;
    }
    return stored.schema === 1 && stored.fingerprint === fingerprint ? stored : null;
  } catch {
    return null;
  }
}

export async function saveCheckpoint(checkpoint: RecognitionCheckpoint): Promise<void> {
  if (JSON.stringify(checkpoint).length > MAX_CHECKPOINT_BYTES) return clearCheckpoint();
  try {
    await withStore("readwrite", (store) => store.put(checkpoint, CURRENT_KEY));
  } catch {
    return;
  }
}

export const discardExpiredCheckpoint = async (): Promise<void> => {
  try {
    const stored = await withStore<RecognitionCheckpoint | undefined>("readonly", (store) => store.get(CURRENT_KEY));
    if (stored && Date.now() - stored.savedAt > MAX_AGE_MS) await clearCheckpoint();
  } catch {
    return;
  }
};
