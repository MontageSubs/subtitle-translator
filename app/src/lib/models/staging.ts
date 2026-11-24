import { MODEL_CACHE_NAME } from "../../config/storage";
import type { ModelManifest } from "./types";

const STAGING_ROOT = "__staged__";
const STAGED_PATH_PATTERN = /__staged__\/([^/]+)\/([^/]+)\//;

const stagedFileKey = (id: string, version: string, name: string): string => new URL(`${import.meta.env.BASE_URL}${STAGING_ROOT}/${id}/${version}/${name}`, location.origin).href;

export async function persistStagedFiles(model: ModelManifest, files: ReadonlyMap<string, Blob>): Promise<void> {
  const cache = await caches.open(MODEL_CACHE_NAME);
  await Promise.all([...files].map(([name, blob]) => cache.put(stagedFileKey(model.id, model.version, name), new Response(blob, { headers: { "Content-Type": "application/octet-stream", "Content-Length": String(blob.size) } }))));
}

export async function readStagedFiles(model: ModelManifest): Promise<Map<string, Blob>> {
  try {
    const cache = await caches.open(MODEL_CACHE_NAME);
    const stored = await Promise.all(model.files.map(async ({ name }) => [name, await (await cache.match(stagedFileKey(model.id, model.version, name)))?.blob()] as const));
    return new Map(stored.filter((entry): entry is [string, Blob] => entry[1] !== undefined));
  } catch {
    return new Map();
  }
}

export async function clearStagedFiles(model: ModelManifest): Promise<void> {
  try {
    const cache = await caches.open(MODEL_CACHE_NAME);
    await Promise.all(model.files.map(({ name }) => cache.delete(stagedFileKey(model.id, model.version, name))));
  } catch {
    return;
  }
}

export async function purgeStaleStaging(current: ReadonlySet<string>): Promise<void> {
  const cache = await caches.open(MODEL_CACHE_NAME);
  const stale = (await cache.keys()).filter((request) => {
    const match = STAGED_PATH_PATTERN.exec(request.url);
    return match !== null && !current.has(`${match[1]}/${match[2]}`);
  });
  await Promise.all(stale.map((request) => cache.delete(request)));
}
