import { MODEL_CACHE_NAME } from "../../config/storage";
import type { ModelManifest } from "./types";

const STORAGE_HEADROOM_FACTOR = 1.5;

export const modelCacheName = MODEL_CACHE_NAME;

export const modelFileKey = (id: string, version: string, name: string): string => new URL(`${import.meta.env.BASE_URL}__models__/${id}/${version}/${name}`, location.origin).href;

export async function hasAllFiles(model: ModelManifest, version: string): Promise<boolean> {
  const cache = await caches.open(MODEL_CACHE_NAME);
  const matches = await Promise.all(model.files.map(({ name }) => cache.match(modelFileKey(model.id, version, name))));
  return matches.every(Boolean);
}

export async function storeFiles(model: ModelManifest, files: ReadonlyMap<string, Blob>): Promise<void> {
  const cache = await caches.open(MODEL_CACHE_NAME);
  await Promise.all([...files].map(([name, blob]) => cache.put(modelFileKey(model.id, model.version, name), new Response(blob, { headers: { "Content-Type": "application/octet-stream", "Content-Length": String(blob.size) } }))));
}

export async function deleteVersion(model: ModelManifest, version: string): Promise<void> {
  const cache = await caches.open(MODEL_CACHE_NAME);
  await Promise.all(model.files.map(({ name }) => cache.delete(modelFileKey(model.id, version, name))));
}

export async function hasStorageHeadroom(bytes: number): Promise<boolean> {
  const estimate = await navigator.storage?.estimate?.().catch(() => undefined);
  if (!estimate?.quota || estimate.usage === undefined) return true;
  return estimate.quota - estimate.usage >= bytes * STORAGE_HEADROOM_FACTOR;
}

const STORED_PATH_PATTERN = /__models__\/([^/]+)\/([^/]+)\//;

export async function purgeUnreferencedFiles(referenced: ReadonlySet<string>): Promise<void> {
  const cache = await caches.open(MODEL_CACHE_NAME);
  const stale = (await cache.keys()).filter((request) => {
    const match = STORED_PATH_PATTERN.exec(request.url);
    return match !== null && !referenced.has(`${match[1]}/${match[2]}`);
  });
  await Promise.all(stale.map((request) => cache.delete(request)));
}
