import { STORAGE_KEYS } from "../../config/storage";
import { CHANNEL } from "../../config/channel";
import { modelCatalogPath } from "../../config/assetLayout";
import { persistentStorage } from "../../utils/safeStorage";
import { applyModelUpdates, bundledModelIds } from "./catalog";
import { validateManifest } from "./manifest";
import type { ModelManifest, ModelUpdate } from "./types";

const SOURCES = __MODEL_SOURCES__;
const REQUEST_TIMEOUT_MS = 6_000;

type StoredUpdates = Record<string, ModelUpdate>;

const isText = (value: unknown): value is string => typeof value === "string" && value.trim() !== "";
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

function parseMeta(raw: unknown): ModelUpdate["meta"] {
  if (!isRecord(raw)) return undefined;
  const homepage = isText(raw.homepage) && raw.homepage.startsWith("https://") ? raw.homepage : undefined;
  return { ...(isText(raw.author) ? { author: raw.author } : {}), ...(homepage ? { homepage } : {}), ...(isText(raw.license) ? { license: raw.license } : {}) };
}

function parseUpdates(models: unknown): StoredUpdates {
  const accepted: StoredUpdates = {};
  if (!isRecord(models)) return accepted;
  const known = bundledModelIds();
  for (const [id, entry] of Object.entries(models)) {
    if (!known.has(id) || !isRecord(entry) || !isRecord(entry.manifest)) continue;
    const manifest = entry.manifest as unknown as ModelManifest;
    if (manifest.id !== id || validateManifest(manifest).length > 0) continue;
    const bytes = typeof entry.bytes === "number" && entry.bytes > 0 ? entry.bytes : undefined;
    accepted[id] = { manifest, ...(bytes ? { bytes } : {}), ...(parseMeta(entry.meta) ? { meta: parseMeta(entry.meta) } : {}) };
  }
  return accepted;
}

async function fetchCatalogDocument(): Promise<StoredUpdates | null> {
  for (const source of SOURCES) {
    const response = await fetch(new URL(`${source}/${modelCatalogPath(CHANNEL.id)}`, location.origin).href, { credentials: "omit", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }).catch(() => null);
    const body: unknown = response?.ok ? await response.json().catch(() => null) : null;
    if (isRecord(body) && body.schema === 1) return parseUpdates(body.models);
  }
  return null;
}

export function restoreStoredCatalog(): void {
  const stored = persistentStorage.readJson<StoredUpdates>(STORAGE_KEYS.modelCatalog);
  if (stored) applyModelUpdates(new Map(Object.entries(parseUpdates(stored))));
}

export async function fetchModelCatalog(): Promise<boolean> {
  if (SOURCES.length === 0) return false;
  const fetched = await fetchCatalogDocument();
  if (!fetched || Object.keys(fetched).length === 0) return false;
  persistentStorage.writeJson(STORAGE_KEYS.modelCatalog, fetched);
  applyModelUpdates(new Map(Object.entries(fetched)));
  return true;
}
