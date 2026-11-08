import { CHANNEL } from "../../../config/channel";
import { storageKeyOf } from "../../../config/channelProfile";
import { STORAGE_KEYS } from "../../../config/storage";
import { persistentStorage } from "../../../utils/safeStorage";
import { descriptorNameOf } from "../../../config/assetLayout";
import { RUNTIME_BACKEND_FILES, RUNTIME_FILE_NAMES, runtimeKey, runtimeMimeOf, runtimePath, type RuntimeBackend } from "../../../config/runtimeAssets";
import { sha256Hex } from "../../../utils/digest";
import { fetchParts, newPartsState } from "../../net/partsDownload";
import { ModelError } from "./errors";

const ASSETS = __RUNTIME_ASSETS__;
const SOURCES = __RUNTIME_SOURCES__;
const CACHE_NAME = storageKeyOf(CHANNEL, "runtime");
const HEADER_TIMEOUT_MS = 12_000;
const IDLE_RUNTIME_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_PATH_ROOT = "__runtime__";

export interface RuntimePaths {
  mjs: string;
  wasm: string;
}

export interface RuntimeTransferProgress {
  file: string;
  loaded: number;
  total: number;
}

export interface RuntimeUsage {
  version: string;
  bytes: number;
  installed: boolean;
}

const resolved = new Map<RuntimeBackend, Promise<RuntimePaths>>();
const activeTransfers = new Map<string, { loaded: number; total: number }>();
const transferListeners = new Set<() => void>();

const announceTransfers = (): void => transferListeners.forEach((listener) => listener());

export function runtimeTransferProgress(): RuntimeTransferProgress | null {
  const entries = [...activeTransfers];
  if (!entries.length) return null;
  const [largest] = [...entries].sort(([, a], [, b]) => b.total - a.total);
  return {
    file: largest![0],
    loaded: entries.reduce((sum, [, transfer]) => sum + transfer.loaded, 0),
    total: entries.reduce((sum, [, transfer]) => sum + transfer.total, 0),
  };
}

export function subscribeRuntimeTransfers(listener: () => void): () => void {
  transferListeners.add(listener);
  return () => void transferListeners.delete(listener);
}

function trackTransfer(fileName: string, loaded: number, total: number): void {
  activeTransfers.set(fileName, { loaded, total });
  announceTransfers();
}

async function downloadVerified(fileName: string): Promise<Blob | null> {
  const expected = ASSETS.files[fileName]!;
  const signal = new AbortController().signal;
  try {
    for (const source of SOURCES) {
      trackTransfer(fileName, 0, expected.bytes);
      try {
        const descriptorUrl = new URL(`${source}/${runtimePath(ASSETS.version, descriptorNameOf(fileName))}`, location.origin).href;
        let loaded = 0;
        const onBytes = (bytes: number): void => trackTransfer(fileName, (loaded += bytes), expected.bytes);
        const blob = new Blob([await fetchParts(descriptorUrl, newPartsState(), signal, onBytes, { headerTimeoutMs: HEADER_TIMEOUT_MS })], { type: runtimeMimeOf(fileName) });
        if (blob.size === expected.bytes && (await sha256Hex(blob)) === expected.sha256) return blob;
      } catch {
        continue;
      }
    }
    return null;
  } finally {
    activeTransfers.delete(fileName);
    announceTransfers();
  }
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
  announceTransfers();
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

export async function runtimeUsage(): Promise<RuntimeUsage> {
  const cache = await caches.open(CACHE_NAME).catch(() => null);
  const sizes = await Promise.all(
    RUNTIME_FILE_NAMES.map(async (fileName) => {
      const stored = cache ? await readStored(cache, cacheKeyOf(fileName), ASSETS.files[fileName]?.bytes ?? -1, runtimeMimeOf(fileName)).catch(() => null) : null;
      return stored?.size ?? 0;
    }),
  );
  const installed = (Object.values(RUNTIME_BACKEND_FILES) as { binary: string; glue: string }[]).some(({ binary, glue }) => [binary, glue].every((fileName) => sizes[RUNTIME_FILE_NAMES.indexOf(fileName)]! > 0));
  return { version: ASSETS.version, bytes: sizes.reduce((sum, size) => sum + size, 0), installed };
}

export async function removeRuntimeAssets(): Promise<void> {
  await caches.delete(CACHE_NAME).catch(() => false);
  resolved.clear();
  persistentStorage.removeItem(STORAGE_KEYS.runtimeUsedAt);
}
