import { CHANNEL } from "../../../config/channel";
import { storageKeyOf } from "../../../config/channelProfile";
import { STORAGE_KEYS } from "../../../config/storage";
import { persistentStorage } from "../../../utils/safeStorage";
import { descriptorNameOf } from "../../../config/assetLayout";
import { RUNTIME_BACKEND_FILES, RUNTIME_FILE_NAMES, runtimeKey, runtimeMimeOf, runtimePath, type RuntimeBackend } from "../../../config/runtimeAssets";
import { sha256Hex } from "../../../utils/digest";
import { fetchParts, newPartsState, type PartsState } from "../../net/partsDownload";
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

interface HeldTransfer {
  source: number;
  state: PartsState;
  loaded: number;
}

interface SharedTransfer {
  promise: Promise<Blob>;
  controller: AbortController;
  waiters: number;
}

interface PlannedTransfer {
  loaded: number;
  total: number;
}

const resolved = new Map<RuntimeBackend, Promise<RuntimePaths>>();
const planned = new Map<string, PlannedTransfer>();
const held = new Map<string, HeldTransfer>();
const shared = new Map<string, SharedTransfer>();
const transferListeners = new Set<() => void>();

export const RUNTIME_VERSION: string = ASSETS.version;

async function openRuntimeCache(): Promise<Cache | null> {
  try {
    return await caches.open(CACHE_NAME);
  } catch {
    return null;
  }
}

async function deleteRuntimeCache(): Promise<void> {
  try {
    await caches.delete(CACHE_NAME);
  } catch {
    return;
  }
}

const announceTransfers = (): void => transferListeners.forEach((listener) => listener());

export function runtimeTransferProgress(): RuntimeTransferProgress | null {
  const entries = [...planned];
  if (!entries.length) return null;
  const [largest] = [...entries].sort(([, a], [, b]) => b.total - a.total);
  return {
    file: largest![0],
    loaded: entries.reduce((sum, [, transfer]) => sum + transfer.loaded, 0),
    total: entries.reduce((sum, [, transfer]) => sum + transfer.total, 0),
  };
}

export const isRuntimeTransferActive = (): boolean => [...shared.values()].some(({ waiters }) => waiters > 0);

export function subscribeRuntimeTransfers(listener: () => void): () => void {
  transferListeners.add(listener);
  return () => void transferListeners.delete(listener);
}

export function discardIdleRuntimeTransfers(): void {
  if (isRuntimeTransferActive()) return;
  held.clear();
  planned.clear();
  announceTransfers();
}

function trackTransfer(fileName: string, loaded: number): void {
  const entry = planned.get(fileName);
  if (!entry) return;
  planned.set(fileName, { ...entry, loaded });
  announceTransfers();
}

async function downloadVerified(fileName: string, signal: AbortSignal): Promise<Blob | null> {
  const expected = ASSETS.files[fileName]!;
  for (let source = held.get(fileName)?.source ?? 0; source < SOURCES.length; source += 1) {
    const resumed = held.get(fileName);
    const transfer: HeldTransfer = resumed?.source === source ? resumed : { source, state: newPartsState(), loaded: 0 };
    held.set(fileName, transfer);
    trackTransfer(fileName, transfer.loaded);
    try {
      const descriptorUrl = new URL(`${SOURCES[source]}/${runtimePath(ASSETS.version, descriptorNameOf(fileName))}`, location.origin).href;
      const onBytes = (bytes: number): void => {
        if (signal.aborted) return;
        transfer.loaded += bytes;
        trackTransfer(fileName, transfer.loaded);
      };
      const blob = new Blob([await fetchParts(descriptorUrl, transfer.state, signal, onBytes, { headerTimeoutMs: HEADER_TIMEOUT_MS })], { type: runtimeMimeOf(fileName) });
      if (blob.size === expected.bytes && (await sha256Hex(blob)) === expected.sha256) {
        held.delete(fileName);
        return blob;
      }
    } catch (error) {
      if (signal.aborted) throw error;
    }
    held.delete(fileName);
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

async function obtain(fileName: string, signal: AbortSignal): Promise<Blob> {
  const key = cacheKeyOf(fileName);
  const cache = await openRuntimeCache();
  const stored = cache ? await readStored(cache, key, ASSETS.files[fileName]!.bytes, runtimeMimeOf(fileName)).catch(() => null) : null;
  if (stored) {
    markUsed();
    return stored;
  }
  const blob = await downloadVerified(fileName, signal);
  if (!blob) throw new ModelError("runtime");
  if (cache) await storeAndPrune(cache, key, blob).catch(() => undefined);
  trackTransfer(fileName, ASSETS.files[fileName]!.bytes);
  markUsed();
  return blob;
}

const abortError = (): DOMException => new DOMException("Aborted", "AbortError");

function startSharedTransfer(fileName: string): SharedTransfer {
  const controller = new AbortController();
  const created: SharedTransfer = {
    controller,
    waiters: 0,
    promise: obtain(fileName, controller.signal).finally(() => {
      if (shared.get(fileName) === created) shared.delete(fileName);
    }),
  };
  shared.set(fileName, created);
  return created;
}

function obtainOnce(fileName: string, signal?: AbortSignal): Promise<Blob> {
  if (signal?.aborted) return Promise.reject(abortError());
  const existing = shared.get(fileName);
  const transfer = existing && !existing.controller.signal.aborted ? existing : startSharedTransfer(fileName);
  transfer.waiters += 1;
  return new Promise<Blob>((resolve, reject) => {
    const onAbort = (): void => {
      transfer.waiters -= 1;
      if (transfer.waiters === 0) transfer.controller.abort();
      reject(abortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    transfer.promise.then(
      (blob) => {
        signal?.removeEventListener("abort", onAbort);
        resolve(blob);
      },
      (error: unknown) => {
        signal?.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

const loadFile = async (fileName: string): Promise<string> => URL.createObjectURL(await obtainOnce(fileName));

export const hasRuntimeAssets = (): boolean => SOURCES.length > 0 && Object.keys(ASSETS.files ?? {}).length > 0;

export async function ensureRuntimeCached(backend: RuntimeBackend, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw abortError();
  const { binary, glue } = RUNTIME_BACKEND_FILES[backend];
  const files = [binary, glue];
  const cache = await openRuntimeCache();
  for (const fileName of files) {
    if (planned.has(fileName)) continue;
    const expected = ASSETS.files[fileName]!;
    const stored = cache ? await readStored(cache, cacheKeyOf(fileName), expected.bytes, runtimeMimeOf(fileName)).catch(() => null) : null;
    if (!stored) planned.set(fileName, { loaded: held.get(fileName)?.loaded ?? 0, total: expected.bytes });
  }
  const transfers = files.map((fileName) => obtainOnce(fileName, signal));
  announceTransfers();
  try {
    await Promise.all(transfers);
    files.forEach((fileName) => planned.delete(fileName));
  } catch (error) {
    if (!signal?.aborted) files.forEach((fileName) => planned.delete(fileName));
    throw error;
  } finally {
    announceTransfers();
  }
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
  await deleteRuntimeCache();
  persistentStorage.removeItem(STORAGE_KEYS.runtimeUsedAt);
}

export async function runtimeUsage(): Promise<RuntimeUsage> {
  const cache = await openRuntimeCache();
  const sizes = await Promise.all(
    RUNTIME_FILE_NAMES.map(async (fileName) => {
      const stored = cache ? await readStored(cache, cacheKeyOf(fileName), ASSETS.files[fileName]?.bytes ?? -1, runtimeMimeOf(fileName)).catch(() => null) : null;
      return stored?.size ?? 0;
    }),
  );
  const installed = (Object.values(RUNTIME_BACKEND_FILES) as { binary: string; glue: string }[]).some(({ binary, glue }) => [binary, glue].every((fileName) => sizes[RUNTIME_FILE_NAMES.indexOf(fileName)]! > 0));
  return { version: RUNTIME_VERSION, bytes: sizes.reduce((sum, size) => sum + size, 0), installed };
}

export async function removeRuntimeAssets(): Promise<void> {
  await deleteRuntimeCache();
  resolved.clear();
  persistentStorage.removeItem(STORAGE_KEYS.runtimeUsedAt);
}
