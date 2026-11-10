import { STORAGE_KEYS } from "../../config/storage";
import { recommendedUrlOf, type BroadcastEndpoint } from "../../api/broadcastEndpoint";
import { persistentStorage } from "../../utils/safeStorage";

const BUILT_IN_SOURCES = __MODEL_SOURCES__;

const isHttpsUrl = (value: unknown): value is string => typeof value === "string" && URL.canParse(value) && new URL(value).protocol === "https:";

const normalized = (url: string): string => url.replace(/\/+$/, "");

export function modelSources(): readonly string[] {
  const broadcast = persistentStorage.readJson<unknown[]>(STORAGE_KEYS.modelSources);
  const extra = Array.isArray(broadcast) ? broadcast.filter(isHttpsUrl).map(normalized) : [];
  return [...new Set([...BUILT_IN_SOURCES, ...extra])];
}

export function rememberModelSources(endpoint: BroadcastEndpoint | undefined): void {
  if (!endpoint) return;
  const urls = [recommendedUrlOf(endpoint), endpoint.primaryUrl, endpoint.fallbackUrl].filter(isHttpsUrl).map(normalized);
  const extra = [...new Set(urls)].filter((url) => !BUILT_IN_SOURCES.includes(url));
  if (extra.length) persistentStorage.writeJson(STORAGE_KEYS.modelSources, extra);
  else if (persistentStorage.getItem(STORAGE_KEYS.modelSources) !== null) persistentStorage.removeItem(STORAGE_KEYS.modelSources);
}
