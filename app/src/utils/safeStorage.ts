import { isNamespacedKey } from "../config/storage";

export interface SafeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  readJson<T>(key: string): T | null;
  writeJson(key: string, value: unknown): void;
}

function createSafeStorage(pick: () => Storage): SafeStorage {
  const guarded = <T>(key: string, action: (storage: Storage) => T, fallback: T): T => {
    if (!isNamespacedKey(key)) return fallback;
    try {
      return action(pick());
    } catch {
      return fallback;
    }
  };
  const storage: SafeStorage = {
    getItem: (key) => guarded(key, (target) => target.getItem(key), null),
    setItem: (key, value) => guarded(key, (target) => target.setItem(key, value), undefined),
    removeItem: (key) => guarded(key, (target) => target.removeItem(key), undefined),
    readJson: (key) => guarded(key, () => JSON.parse(storage.getItem(key) ?? "null"), null),
    writeJson: (key, value) => guarded(key, () => storage.setItem(key, JSON.stringify(value)), undefined),
  };
  return storage;
}

export const persistentStorage = createSafeStorage(() => localStorage);
export const tabStorage = createSafeStorage(() => sessionStorage);
