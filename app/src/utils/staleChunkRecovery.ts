import { STORAGE_KEYS } from "../config/storage";
import { tabStorage } from "./safeStorage";

const LEAVE_GRACE_MS = 2000;
const RELOAD_COOLDOWN_MS = 15000;

let leavingUntil = 0;
let quietLoads = 0;

const markLeaving = (): void => {
  leavingUntil = performance.now() + LEAVE_GRACE_MS;
};

function claimReload(): boolean {
  if (Date.now() - Number(tabStorage.getItem(STORAGE_KEYS.chunkReload) ?? 0) < RELOAD_COOLDOWN_MS) return false;
  const claim = String(Date.now());
  tabStorage.setItem(STORAGE_KEYS.chunkReload, claim);
  return tabStorage.getItem(STORAGE_KEYS.chunkReload) === claim;
}

export function recoverFromStaleChunk(): boolean {
  if (performance.now() < leavingUntil || !navigator.onLine || !claimReload()) return false;
  location.reload();
  return true;
}

export async function loadQuietly<T>(task: () => Promise<T>): Promise<T> {
  quietLoads++;
  try {
    return await task();
  } finally {
    quietLoads--;
  }
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
