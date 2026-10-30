import { CHANNEL } from "../../../config/channel";
import { storageKeyOf } from "../../../config/channelProfile";
import { RUNTIME_BACKEND_FILES, RUNTIME_ROOT, runtimeMimeOf, runtimePartNames, runtimePath, type RuntimeBackend } from "../../../config/runtimeAssets";
import { sha256Hex } from "../verify";
import { ModelError } from "./errors";

const ASSETS = __RUNTIME_ASSETS__;
const SOURCES = __RUNTIME_SOURCES__;
const CACHE_NAME = storageKeyOf(CHANNEL, "runtime");
const DOWNLOAD_TIMEOUT_MS = 180_000;

const resolved = new Map<RuntimeBackend, Promise<RuntimePaths>>();

export interface RuntimePaths {
  mjs: string;
  wasm: string;
}

async function fetchPart(source: string, name: string): Promise<Blob> {
  const url = new URL(`${source}/${runtimePath(ASSETS.version, name)}`, location.origin);
  const response = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  if (!response.ok || (response.headers.get("content-type") ?? "").includes("text/html")) throw new ModelError("load");
  return response.blob();
}

async function downloadVerified(fileName: string): Promise<Blob | null> {
  const expected = ASSETS.files[fileName]!;
  for (const source of SOURCES) {
    try {
      const parts = await Promise.all(runtimePartNames(fileName, expected.bytes).map((part) => fetchPart(source, part)));
      const blob = new Blob(parts, { type: runtimeMimeOf(fileName) });
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

async function storeAndPrune(cache: Cache, key: string, blob: Blob): Promise<void> {
  await cache.put(key, new Response(blob, { headers: { "Content-Type": blob.type } }));
  const currentRoot = `/${RUNTIME_ROOT}/${ASSETS.version}/`;
  const entries = await cache.keys();
  await Promise.all(entries.filter((entry) => !new URL(entry.url).pathname.includes(currentRoot)).map((entry) => cache.delete(entry)));
}

async function loadFile(fileName: string): Promise<string> {
  const key = runtimePath(ASSETS.version, fileName);
  const cache = await caches.open(CACHE_NAME).catch(() => null);
  const stored = cache ? await readStored(cache, key, ASSETS.files[fileName]!.bytes, runtimeMimeOf(fileName)).catch(() => null) : null;
  const blob = stored ?? (await downloadVerified(fileName));
  if (!blob) throw new ModelError("load");
  if (!stored && cache) await storeAndPrune(cache, key, blob).catch(() => undefined);
  return URL.createObjectURL(blob);
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
