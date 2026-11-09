import { STATS_URL, STATUS_API_URL, STATUS_FALLBACK_API_URL, STATUS_URL } from "../../config/environment";
import { STORAGE_KEYS } from "../../config/storage";
import { persistentStorage } from "../../utils/safeStorage";

const STATUS_FILE = "status.json";
const STATS_FILE = "stats.json";

interface BroadcastStatusSource {
  recommendedSource: string;
  recommendedUrl: string;
}

const stripTrailingSlashes = (url: string): string => url.replace(/\/+$/, "");

const isHttpsUrl = (value: unknown): value is string => typeof value === "string" && URL.canParse(value) && new URL(value).protocol === "https:";

const baseOf = (url: string, file: string): string => (url.endsWith(`/${file}`) ? url.slice(0, -file.length - 1) : "");

const unique = (values: readonly string[]): string[] => [...new Set(values.filter(Boolean))];

const rememberedBase = (): string => {
  const stored = persistentStorage.readJson<string>(STORAGE_KEYS.statusSource);
  return isHttpsUrl(stored) ? stripTrailingSlashes(stored) : "";
};

const hardcodedBases = (): string[] => [baseOf(STATUS_API_URL, STATUS_FILE), baseOf(STATUS_FALLBACK_API_URL, STATUS_FILE)];

export const statusBases = (): string[] => unique([rememberedBase(), ...hardcodedBases()]);

export const statusSourceUrls = (): string[] => statusBases().map((base) => `${base}/${STATUS_FILE}`);

export const statsSourceUrls = (): string[] => unique([...statusBases().map((base) => `${base}/${STATS_FILE}`), STATS_URL]);

let primaryBlocked = false;

const fallbackBase = (): string => baseOf(STATUS_FALLBACK_API_URL, STATUS_FILE);

export const statusPageUrl = (): string => rememberedBase() || (primaryBlocked ? fallbackBase() : "") || STATUS_URL;

export function syncStatusLinks(): void {
  if (!STATUS_URL) return;
  const current = statusPageUrl();
  document.querySelectorAll<HTMLAnchorElement>("a[data-status-link]").forEach((anchor) => {
    if (anchor.getAttribute("href") !== current) anchor.setAttribute("href", current);
  });
}

export function setPrimaryStatusBlocked(blocked: boolean): void {
  if (primaryBlocked === blocked) return;
  primaryBlocked = blocked;
  syncStatusLinks();
}

export function rememberStatusSource(endpoint: BroadcastStatusSource | undefined): void {
  if (!endpoint) return;
  const relocated = endpoint.recommendedSource !== "primary" && isHttpsUrl(endpoint.recommendedUrl);
  if (relocated) persistentStorage.writeJson(STORAGE_KEYS.statusSource, stripTrailingSlashes(endpoint.recommendedUrl));
  else if (persistentStorage.getItem(STORAGE_KEYS.statusSource) !== null) persistentStorage.removeItem(STORAGE_KEYS.statusSource);
  syncStatusLinks();
}
