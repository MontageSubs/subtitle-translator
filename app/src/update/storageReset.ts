import { isClearedByReset, isNamespacedKey, RESET_MARKER_CACHE_NAME, RESET_MARKER_PATH, type StorageResetMode } from "../config/storage";

const markerUrl = (): string => new URL(RESET_MARKER_PATH, new URL(import.meta.env.BASE_URL, location.origin)).href;

const RESET_MODES: readonly StorageResetMode[] = ["expired", "relocated"];

const isResetMode = (value: unknown): value is StorageResetMode => RESET_MODES.includes(value as StorageResetMode);

function clearStorage(storage: Storage, mode: StorageResetMode): void {
  const names = Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter((name): name is string => name !== null);
  for (const name of names) if (isNamespacedKey(name) && isClearedByReset(name, mode)) storage.removeItem(name);
}

export function applyStorageReset(mode: StorageResetMode): void {
  for (const pick of [() => localStorage, () => sessionStorage]) {
    try {
      clearStorage(pick(), mode);
    } catch {}
  }
}

export async function applyPendingStorageReset(): Promise<void> {
  try {
    const cache = await caches.open(RESET_MARKER_CACHE_NAME);
    const marker = await cache.match(markerUrl());
    if (!marker) return;
    await cache.delete(markerUrl());
    const { mode } = (await marker.json()) as { mode?: unknown };
    if (isResetMode(mode)) applyStorageReset(mode);
  } catch {}
}

export function listenForStorageReset(): void {
  navigator.serviceWorker.addEventListener("message", ({ data }) => {
    if (data?.type === "reset-storage" && isResetMode(data.mode)) applyStorageReset(data.mode);
  });
}
