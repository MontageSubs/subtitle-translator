import { SHELL_CACHE_NAME } from "../config/storage";

const RELOAD_GUARD_KEY = "subtitle-translator:chunk-reload";
const MAX_RELOAD_ATTEMPTS = 2;

function readAttempts(): number {
  return Number(sessionStorage.getItem(RELOAD_GUARD_KEY) || "0");
}

function purgeShellAndReload(): void {
  void Promise.all([
    navigator.serviceWorker?.getRegistration(import.meta.env.BASE_URL).then((registration) => registration?.unregister()),
    caches.delete(SHELL_CACHE_NAME),
  ]).finally(() => location.reload());
}

export function recoverFromStaleChunk(): void {
  const attempts = readAttempts();
  if (attempts >= MAX_RELOAD_ATTEMPTS) return;
  sessionStorage.setItem(RELOAD_GUARD_KEY, String(attempts + 1));
  if (attempts === 0) location.reload();
  else purgeShellAndReload();
}

export function markAppHealthy(): void {
  sessionStorage.removeItem(RELOAD_GUARD_KEY);
}

function assetUrlOf(target: EventTarget | null): string {
  if (target instanceof HTMLLinkElement && target.rel === "stylesheet") return target.href;
  if (target instanceof HTMLScriptElement) return target.src;
  return "";
}

function isOwnAsset(url: string): boolean {
  try {
    return Boolean(url) && new URL(url, location.href).origin === location.origin;
  } catch {
    return false;
  }
}

export function installStaleChunkRecovery(): void {
  window.addEventListener("vite:preloadError", (event) => {
    event.preventDefault();
    recoverFromStaleChunk();
  });
  window.addEventListener("error", (event) => {
    if (isOwnAsset(assetUrlOf(event.target))) recoverFromStaleChunk();
  }, true);
}
