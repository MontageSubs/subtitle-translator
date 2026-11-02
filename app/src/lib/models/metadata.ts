import { STORAGE_KEYS } from "../../config/storage";
import { MODEL_POINTER_NAME, modelDirectory } from "../../config/assetLayout";
import { persistentStorage } from "../../utils/safeStorage";
import { applyModelOverlays, bundledModelIds } from "./catalog";
import type { ModelOverlay } from "./types";

const SOURCES = __MODEL_SOURCES__;
const REQUEST_TIMEOUT_MS = 6_000;

type StoredOverlays = Record<string, ModelOverlay>;

const isText = (value: unknown): value is string => typeof value === "string" && value.trim() !== "";
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

function parsePointer(raw: unknown): ModelOverlay | null {
  if (!isRecord(raw) || raw.schema !== 1 || typeof raw.bytes !== "number" || !(raw.bytes > 0)) return null;
  const meta = isRecord(raw.meta) ? raw.meta : {};
  const homepage = isText(meta.homepage) && meta.homepage.startsWith("https://") ? meta.homepage : undefined;
  return { bytes: raw.bytes, ...(isText(meta.author) ? { author: meta.author } : {}), ...(homepage ? { homepage } : {}), ...(isText(meta.license) ? { license: meta.license } : {}) };
}

async function fetchOverlay(id: string): Promise<ModelOverlay | null> {
  for (const source of SOURCES) {
    const response = await fetch(`${source}/${modelDirectory(id)}/${MODEL_POINTER_NAME}`, { credentials: "omit", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }).catch(() => null);
    const overlay = response?.ok ? parsePointer(await response.json().catch(() => null)) : null;
    if (overlay) return overlay;
  }
  return null;
}

export function restoreStoredMetadata(): void {
  const stored = persistentStorage.readJson<StoredOverlays>(STORAGE_KEYS.modelMetadata);
  if (stored) applyModelOverlays(new Map(Object.entries(stored)));
}

export async function fetchModelMetadata(): Promise<boolean> {
  if (SOURCES.length === 0) return false;
  const fetched = await Promise.all(bundledModelIds().map(async (id) => [id, await fetchOverlay(id)] as const));
  const found = fetched.filter((entry): entry is readonly [string, ModelOverlay] => entry[1] !== null);
  if (found.length === 0) return false;
  persistentStorage.writeJson(STORAGE_KEYS.modelMetadata, Object.fromEntries(found));
  applyModelOverlays(new Map(found));
  return true;
}
