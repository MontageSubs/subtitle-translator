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
  accessBlock: key("access-block"),
  compactLayout: key("compact-layout"),
  noticeDismissedId: key("notice-dismissed-id"),
  statsRemoteBase: key("stats-remote-base"),
  statsLocalIncrement: key("stats-local-increment"),
  localeSwitchDraft: key("locale-switch-draft"),
  historyWarningDismissed: key("history-warning-dismissed"),
  chunkReload: key("chunk-reload"),
} as const;

export const HISTORY_DATABASE_NAME = key("history");

export const announcementKey = (locale: string): string => key(`announcement:${locale}`);

export const isNamespacedKey = (name: string): boolean => name.startsWith(`${STORAGE_NAMESPACE}:`);

const productionOnly = (keys: Readonly<Record<string, string>>): Readonly<Record<string, string>> => (CHANNEL.id === PRODUCTION_CHANNEL ? keys : {});

export const LEGACY_LOCAL_STORAGE_KEYS = productionOnly({
  "translator.endpoints": STORAGE_KEYS.endpoints,
});

export const LEGACY_SESSION_STORAGE_KEYS = productionOnly({
  "history.warningDismissed": STORAGE_KEYS.historyWarningDismissed,
});
