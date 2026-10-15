import { persistentStorage } from "../../utils/safeStorage";

const STORAGE_KEY = "subtitle-translator:access-block";

const listeners = new Set<() => void>();

export function activeAccessBlock(now: number = Date.now()): number | null {
  const retryAt = persistentStorage.readJson<number>(STORAGE_KEY);
  if (typeof retryAt === "number" && retryAt > now) return retryAt;
  if (retryAt !== null) persistentStorage.removeItem(STORAGE_KEY);
  return null;
}

export function rememberAccessBlock(retryAt: number): void {
  persistentStorage.writeJson(STORAGE_KEY, retryAt);
  listeners.forEach((listener) => listener());
}

export function onAccessBlockChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
