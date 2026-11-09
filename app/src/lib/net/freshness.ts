import { persistentStorage } from "../../utils/safeStorage";

export const PAGES_CONTENT_TTL_MS = 5 * 60_000;

export function isFresh(storageKey: string, ttlMs: number = PAGES_CONTENT_TTL_MS): boolean {
  const fetchedAt = persistentStorage.readJson<number>(storageKey);
  if (typeof fetchedAt !== "number") return false;
  const age = Date.now() - fetchedAt;
  return age >= 0 && age < ttlMs;
}

export const markFresh = (storageKey: string): void => persistentStorage.writeJson(storageKey, Date.now());
