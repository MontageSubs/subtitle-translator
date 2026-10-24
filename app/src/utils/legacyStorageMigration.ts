import { LEGACY_LOCAL_STORAGE_KEYS, LEGACY_SESSION_STORAGE_KEYS } from "../config/storage";

function migrateKeys(pick: () => Storage, legacyKeys: Readonly<Record<string, string>>): void {
  try {
    const storage = pick();
    for (const [legacyKey, key] of Object.entries(legacyKeys)) {
      const value = storage.getItem(legacyKey);
      if (value === null) continue;
      if (storage.getItem(key) === null) storage.setItem(key, value);
      storage.removeItem(legacyKey);
    }
  } catch {}
}

migrateKeys(() => localStorage, LEGACY_LOCAL_STORAGE_KEYS);
migrateKeys(() => sessionStorage, LEGACY_SESSION_STORAGE_KEYS);
