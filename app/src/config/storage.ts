export const STORAGE_NAMESPACE = "subtitle-translator";

export const storageKey = (name: string): string => `${STORAGE_NAMESPACE}:${name}`;

export const isNamespacedKey = (key: string): boolean => key.startsWith(`${STORAGE_NAMESPACE}:`);

export const LEGACY_LOCAL_STORAGE_KEYS: Readonly<Record<string, string>> = {
  "translator.endpoints": storageKey("endpoints"),
};

export const LEGACY_SESSION_STORAGE_KEYS: Readonly<Record<string, string>> = {
  "history.warningDismissed": storageKey("history-warning-dismissed"),
};
