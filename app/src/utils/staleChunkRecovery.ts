import { STORAGE_KEYS } from "../config/storage";
import { tabStorage } from "./safeStorage";

const LEAVE_GRACE_MS = 2000;

let leavingUntil = 0;
let quietLoads = 0;

const markLeaving = (): void => {
  leavingUntil = performance.now() + LEAVE_GRACE_MS;
};

function claimReload(): boolean {
  if (tabStorage.getItem(STORAGE_KEYS.chunkReload)) return false;
  tabStorage.setItem(STORAGE_KEYS.chunkReload, "1");
  return tabStorage.getItem(STORAGE_KEYS.chunkReload) === "1";
}

export function recoverFromStaleChunk(): void {
  if (performance.now() < leavingUntil || !navigator.onLine || !claimReload()) return;
  location.reload();
}

export async function loadQuietly<T>(task: () => Promise<T>): Promise<T> {
  quietLoads++;
  try {
    return await task();
  } finally {
    quietLoads--;
  }
}

export function markAppHealthy(): void {
  tabStorage.removeItem(STORAGE_KEYS.chunkReload);
}

function ownAssetUrl(target: EventTarget | null): string | undefined {
  const url = target instanceof HTMLLinkElement && target.rel === "stylesheet" ? target.href : target instanceof HTMLScriptElement ? target.src : "";
  return url && new URL(url, location.href).origin === location.origin ? url : undefined;
}

export function installStaleChunkRecovery(): void {
  window.addEventListener("beforeunload", markLeaving);
  window.addEventListener("pagehide", markLeaving);
  window.addEventListener("pageshow", () => {
    leavingUntil = 0;
  });
  window.addEventListener("vite:preloadError", (event) => {
    event.preventDefault();
    if (!quietLoads) recoverFromStaleChunk();
  });
  window.addEventListener(
    "error",
    (event) => {
      if (ownAssetUrl(event.target)) recoverFromStaleChunk();
    },
    true
  );
}
