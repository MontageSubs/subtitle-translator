export interface SafeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  readJson<T>(key: string): T | null;
  writeJson(key: string, value: unknown): void;
}

function createSafeStorage(pick: () => Storage): SafeStorage {
  const guarded = <T>(action: (storage: Storage) => T, fallback: T): T => {
    try {
      return action(pick());
    } catch {
      return fallback;
    }
  };
  const storage: SafeStorage = {
    getItem: (key) => guarded((target) => target.getItem(key), null),
    setItem: (key, value) => guarded((target) => target.setItem(key, value), undefined),
    removeItem: (key) => guarded((target) => target.removeItem(key), undefined),
    readJson: (key) => guarded(() => JSON.parse(storage.getItem(key) ?? "null"), null),
    writeJson: (key, value) => guarded(() => storage.setItem(key, JSON.stringify(value)), undefined),
  };
  return storage;
}

export const persistentStorage = createSafeStorage(() => localStorage);
export const tabStorage = createSafeStorage(() => sessionStorage);
