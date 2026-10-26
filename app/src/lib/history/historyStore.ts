import { HISTORY_DATABASE_NAME } from "../../config/storage";
import { announceUpdateIfAvailable } from "../../update/updateWatcher";
import { notifyHistoryChange } from "./historyChange";
import { decodeBody, encodeBody, EncodedBody } from "./historyCodec";
import { isLegacyJob } from "./historyMigration";
import { HISTORY_SCHEMA, joinJob, readJob, splitJob } from "./historySchema";
import type { HistoryJob, HistoryJobBody, HistorySummary } from "./historyTypes";

const DB_VERSION = 3;
const HEAD_STORE = "jobs";
const BODY_STORE = "bodies";

interface BodyRecord extends EncodedBody {
  id: string;
  schema: number;
}

let connection: Promise<IDBDatabase> | null = null;

const isHead = (raw: any): raw is HistorySummary => typeof raw?.id === "string" && typeof raw.cueCount === "number" && Array.isArray(raw.files);

function runRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function openConnection(): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(HISTORY_DATABASE_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(HEAD_STORE)) db.createObjectStore(HEAD_STORE, { keyPath: "id" }).createIndex("createdAt", "createdAt");
      if (!db.objectStoreNames.contains(BODY_STORE)) db.createObjectStore(BODY_STORE, { keyPath: "id" });
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
      if (request.error?.name === "VersionError") void announceUpdateIfAvailable();
      reject(request.error);
    };
  });
}

async function writeRecords(db: IDBDatabase, head: HistorySummary, body?: HistoryJobBody): Promise<void> {
  const record: BodyRecord | undefined = body ? { id: head.id, schema: HISTORY_SCHEMA, ...(await encodeBody(body)) } : undefined;
  const transaction = db.transaction(record ? [HEAD_STORE, BODY_STORE] : [HEAD_STORE], "readwrite");
  transaction.objectStore(HEAD_STORE).put(head);
  if (record) transaction.objectStore(BODY_STORE).put(record);
  await transactionDone(transaction);
}

async function upgradeLegacyRecords(db: IDBDatabase): Promise<void> {
  const stored = await runRequest(db.transaction(HEAD_STORE).objectStore(HEAD_STORE).getAll() as IDBRequest<any[]>);
  for (const raw of stored.filter((record) => Array.isArray(record?.subtitles) && isLegacyJob(record))) {
    const job = readJob(raw);
    if (!job) continue;
    const { head, body } = splitJob(job);
    await writeRecords(db, head, body);
  }
}

function database(): Promise<IDBDatabase> {
  connection ??= openConnection()
    .then(async (db) => {
      await upgradeLegacyRecords(db);
      return db;
    })
    .catch((error) => {
      connection = null;
      throw error;
    });
  return connection;
}

export async function listHeads(): Promise<HistorySummary[]> {
  const db = await database();
  const stored = await runRequest(db.transaction(HEAD_STORE).objectStore(HEAD_STORE).getAll() as IDBRequest<any[]>);
  return stored.filter(isHead).sort((a, b) => b.createdAt - a.createdAt);
}

export async function getHead(id: string): Promise<HistorySummary | undefined> {
  const db = await database();
  const raw = await runRequest(db.transaction(HEAD_STORE).objectStore(HEAD_STORE).get(id) as IDBRequest<any>);
  return isHead(raw) ? raw : undefined;
}

export async function getJob(id: string): Promise<HistoryJob | undefined> {
  const db = await database();
  const transaction = db.transaction([HEAD_STORE, BODY_STORE]);
  const [head, record] = await Promise.all([
    runRequest(transaction.objectStore(HEAD_STORE).get(id) as IDBRequest<any>),
    runRequest(transaction.objectStore(BODY_STORE).get(id) as IDBRequest<BodyRecord | undefined>),
  ]);
  if (!isHead(head) || !record || record.schema > HISTORY_SCHEMA) return undefined;
  return joinJob(head, await decodeBody<HistoryJobBody>(record));
}

export async function putJob(job: HistoryJob): Promise<void> {
  const { head, body } = splitJob(job);
  await writeRecords(await database(), head, body);
  notifyHistoryChange();
}

export async function putHead(head: HistorySummary): Promise<void> {
  await writeRecords(await database(), head);
}

export async function deleteJob(id: string): Promise<void> {
  const db = await database();
  const transaction = db.transaction([HEAD_STORE, BODY_STORE], "readwrite");
  transaction.objectStore(HEAD_STORE).delete(id);
  transaction.objectStore(BODY_STORE).delete(id);
  await transactionDone(transaction);
  notifyHistoryChange();
}

export async function clearJobs(): Promise<void> {
  const db = await database();
  const transaction = db.transaction([HEAD_STORE, BODY_STORE], "readwrite");
  transaction.objectStore(HEAD_STORE).clear();
  transaction.objectStore(BODY_STORE).clear();
  await transactionDone(transaction);
  notifyHistoryChange();
}
