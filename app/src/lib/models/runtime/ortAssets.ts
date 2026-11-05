import { CHANNEL } from "../../../config/channel";
import { storageKeyOf } from "../../../config/channelProfile";
import { STORAGE_KEYS } from "../../../config/storage";
import { persistentStorage } from "../../../utils/safeStorage";
import { descriptorNameOf } from "../../../config/assetLayout";
import { RUNTIME_BACKEND_FILES, runtimeKey, runtimeMimeOf, runtimePath, type RuntimeBackend } from "../../../config/runtimeAssets";
import { sha256Hex } from "../../../utils/digest";
import { fetchParts, newPartsState } from "../../net/partsDownload";
import { ModelError } from "./errors";

const ASSETS = __RUNTIME_ASSETS__;
const SOURCES = __RUNTIME_SOURCES__;
const CACHE_NAME = storageKeyOf(CHANNEL, "runtime");
const HEADER_TIMEOUT_MS = 12_000;
const IGNORED_PROGRESS = (): void => undefined;
const IDLE_RUNTIME_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_PATH_ROOT = "__runtime__";

export interface RuntimePaths {
  mjs: string;
  wasm: string;
}

const resolved = new Map<RuntimeBackend, Promise<RuntimePaths>>();

async function downloadVerified(fileName: string): Promise<Blob | null> {
  const expected = ASSETS.files[fileName]!;
  const signal = new AbortController().signal;
  for (const source of SOURCES) {
    try {
      const descriptorUrl = new URL(`${source}/${runtimePath(ASSETS.version, descriptorNameOf(fileName))}`, location.origin).href;
      const blob = new Blob([await fetchParts(descriptorUrl, newPartsState(), signal, IGNORED_PROGRESS, { headerTimeoutMs: HEADER_TIMEOUT_MS })], { type: runtimeMimeOf(fileName) });
      if (blob.size === expected.bytes && (await sha256Hex(blob)) === expected.sha256) return blob;
    } catch {
      continue;
    }
  }
  return null;
}

async function readStored(cache: Cache, key: string, bytes: number, type: string): Promise<Blob | null> {
  const stored = await cache.match(key);
  const blob = stored ? await stored.blob() : null;
  return blob && blob.size === bytes ? new Blob([blob], { type }) : null;
}

const cacheKeyOf = (fileName: string): string => new URL(`${import.meta.env.BASE_URL}${CACHE_PATH_ROOT}/${runtimePath(ASSETS.version, fileName)}`, location.origin).href;

const currentRootPath = (): string => new URL(`${import.meta.env.BASE_URL}${CACHE_PATH_ROOT}/${runtimeKey(ASSETS.version)}/`, location.origin).pathname;

const markUsed = (): void => persistentStorage.writeJson(STORAGE_KEYS.runtimeUsedAt, Date.now());

async function storeAndPrune(cache: Cache, key: string, blob: Blob): Promise<void> {
  await cache.put(key, new Response(blob, { headers: { "Content-Type": blob.type } }));
  const root = currentRootPath();
  const entries = await cache.keys();
  await Promise.all(entries.filter((entry) => !new URL(entry.url).pathname.startsWith(root)).map((entry) => cache.delete(entry)));
}

const pending = new Map<string, Promise<Blob>>();

async function obtain(fileName: string): Promise<Blob> {
  const key = cacheKeyOf(fileName);
  const cache = await caches.open(CACHE_NAME).catch(() => null);
  const stored = cache ? await readStored(cache, key, ASSETS.files[fileName]!.bytes, runtimeMimeOf(fileName)).catch(() => null) : null;
  if (stored) {
    markUsed();
    return stored;
  }
  const blob = await downloadVerified(fileName);
  if (!blob) throw new ModelError("runtime");
  if (cache) await storeAndPrune(cache, key, blob).catch(() => undefined);
  markUsed();
  return blob;
}

function obtainOnce(fileName: string): Promise<Blob> {
  const existing = pending.get(fileName);
  if (existing) return existing;
  const created = obtain(fileName).finally(() => pending.delete(fileName));
  pending.set(fileName, created);
  return created;
}

const loadFile = async (fileName: string): Promise<string> => URL.createObjectURL(await obtainOnce(fileName));

export const hasRuntimeAssets = (): boolean => SOURCES.length > 0 && Object.keys(ASSETS.files ?? {}).length > 0;

export async function ensureRuntimeCached(backend: RuntimeBackend): Promise<void> {
  const { binary, glue } = RUNTIME_BACKEND_FILES[backend];
  await Promise.all([obtainOnce(binary), obtainOnce(glue)]);
}

const load = async (backend: RuntimeBackend): Promise<RuntimePaths> => {
  const { binary, glue } = RUNTIME_BACKEND_FILES[backend];
  const [wasm, mjs] = await Promise.all([loadFile(binary), loadFile(glue)]);
  return { wasm, mjs };
};

export function resolveRuntimePaths(backend: RuntimeBackend): Promise<RuntimePaths> {
  const existing = resolved.get(backend);
  if (existing) return existing;
  const pending = load(backend);
  resolved.set(backend, pending);
  pending.catch(() => resolved.delete(backend));
  return pending;
}

export async function purgeIdleRuntime(modelsInstalled: boolean): Promise<void> {
  const usedAt = persistentStorage.readJson<number>(STORAGE_KEYS.runtimeUsedAt);
  if (modelsInstalled) return;
  if (usedAt === null) return markUsed();
  if (Date.now() - usedAt < IDLE_RUNTIME_TTL_MS) return;
  await caches.delete(CACHE_NAME).catch(() => false);
  persistentStorage.removeItem(STORAGE_KEYS.runtimeUsedAt);
}
