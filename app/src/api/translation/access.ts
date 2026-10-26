import { STORAGE_KEYS } from "../../config/storage";
import { persistentStorage } from "../../utils/safeStorage";


const listeners = new Set<() => void>();

export function activeAccessBlock(now: number = Date.now()): number | null {
  const retryAt = persistentStorage.readJson<number>(STORAGE_KEYS.accessBlock);
  if (typeof retryAt === "number" && retryAt > now) return retryAt;
  if (retryAt !== null) persistentStorage.removeItem(STORAGE_KEYS.accessBlock);
  return null;
}

export function rememberAccessBlock(retryAt: number): void {
  persistentStorage.writeJson(STORAGE_KEYS.accessBlock, retryAt);
  listeners.forEach((listener) => listener());
}

export function onAccessBlockChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
