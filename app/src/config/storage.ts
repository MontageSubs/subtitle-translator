import { CHANNEL } from "./channel";
import { PRODUCTION_CHANNEL, storageKeyOf } from "./channelProfile";

const key = (name: string): string => storageKeyOf(CHANNEL, name);

export const STORAGE_NAMESPACE = CHANNEL.storageNamespace;

export const STORAGE_KEYS = {
  locale: key("locale"),
  provider: key("provider"),
  endpoints: key("endpoints"),
  session: key("session"),
  capabilities: key("capabilities"),
  requiredVersion: key("required-version"),
  historyId: key("history-id"),
  recentTargetLanguages: key("recent-target-languages"),
  recentSourceLanguages: key("recent-source-languages"),
  accessBlock: key("access-block"),
  workerCooldown: key("worker-cooldown"),
  lastStatus: key("last-status"),
  compactLayout: key("compact-layout"),
  noticeDismissedId: key("notice-dismissed-id"),
  statsRemoteBase: key("stats-remote-base"),
  statsLocalIncrement: key("stats-local-increment"),
  localeSwitchDraft: key("locale-switch-draft"),
  historyWarningDismissed: key("history-warning-dismissed"),
  historyAwaitingDownload: key("history-awaiting-download"),
  chunkReload: key("chunk-reload"),
  modelRecords: key("model-records"),
  modelCatalog: key("model-catalog"),
  modelCatalogFetchedAt: key("model-catalog-fetched-at"),
  statsFetchedAt: key("stats-fetched-at"),
  recognitionDepth: key("recognition-depth"),
  runtimeUsedAt: key("runtime-used-at"),
  statusSource: key("status-source"),
  modelSources: key("model-sources"),
  siteMigrationAt: key("site-migration-at"),
} as const;

export type StorageTier = "critical" | "preference" | "disposable";

export type StorageResetMode = "expired" | "relocated";

const NON_DISPOSABLE_TIERS: Partial<Record<keyof typeof STORAGE_KEYS, Exclude<StorageTier, "disposable">>> = {
  historyId: "critical",
  modelRecords: "critical",
  locale: "preference",
  provider: "preference",
  recentTargetLanguages: "preference",
  recentSourceLanguages: "preference",
  recognitionDepth: "preference",
};

const TIER_BY_KEY: ReadonlyMap<string, StorageTier> = new Map(
  (Object.keys(NON_DISPOSABLE_TIERS) as (keyof typeof STORAGE_KEYS)[]).map((name) => [STORAGE_KEYS[name], NON_DISPOSABLE_TIERS[name]!]),
);

export const storageTierOf = (name: string): StorageTier => TIER_BY_KEY.get(name) ?? "disposable";

export const isClearedByReset = (name: string, mode: StorageResetMode): boolean => {
  const tier = storageTierOf(name);
  return tier === "disposable" || (mode === "relocated" && tier === "preference");
};

export const RESET_MARKER_CACHE_NAME = key("shell-reset");

export const RESET_MARKER_PATH = "__reset__";

export const HISTORY_DATABASE_NAME = key("history");

export const RECOGNITION_DATABASE_NAME = key("recognition");

export const MODEL_CACHE_NAME = key("models");

export const announcementKey = (locale: string): string => key(`announcement:${locale}`);

export const isNamespacedKey = (name: string): boolean => name.startsWith(`${STORAGE_NAMESPACE}:`);

const productionOnly = (keys: Readonly<Record<string, string>>): Readonly<Record<string, string>> => (CHANNEL.id === PRODUCTION_CHANNEL ? keys : {});

export const LEGACY_LOCAL_STORAGE_KEYS = productionOnly({
  "translator.endpoints": STORAGE_KEYS.endpoints,
});

export const LEGACY_SESSION_STORAGE_KEYS = productionOnly({
  "history.warningDismissed": STORAGE_KEYS.historyWarningDismissed,
});
