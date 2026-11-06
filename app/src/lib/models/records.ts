import { STORAGE_KEYS } from "../../config/storage";
import { persistentStorage } from "../../utils/safeStorage";
import type { ModelRecord } from "./types";

const RECORD_SCHEMA = 1;

interface RecordStore {
  schema: number;
  models: Record<string, ModelRecord>;
}

const isRecord = (value: unknown): value is ModelRecord => {
  const record = value as Partial<ModelRecord> | null;
  return typeof record?.version === "string" && typeof record.installedAt === "number" && typeof record.enabled === "boolean";
};

export function readRecords(): Record<string, ModelRecord> {
  const stored = persistentStorage.readJson<RecordStore>(STORAGE_KEYS.modelRecords);
  if (!stored || stored.schema !== RECORD_SCHEMA || typeof stored.models !== "object") return {};
  return Object.fromEntries(Object.entries(stored.models).filter(([, record]) => isRecord(record)));
}

export function writeRecord(id: string, record: ModelRecord | null): void {
  const models = readRecords();
  if (record) models[id] = record;
  else delete models[id];
  persistentStorage.writeJson(STORAGE_KEYS.modelRecords, { schema: RECORD_SCHEMA, models } satisfies RecordStore);
}
