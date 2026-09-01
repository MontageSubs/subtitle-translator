import { registerSW } from "virtual:pwa-register";

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;
const STARTUP_GRACE_MS = 15 * 1000;

let registration: ServiceWorkerRegistration | undefined;
let updateSW: ((reloadPage?: boolean) => Promise<void>) | undefined;
let checksEnabled = false;
let updateInFlight = false;

function checkForUpdate(): void {
  if (!checksEnabled || updateInFlight || !registration) return;
  updateInFlight = true;
  registration.update().finally(() => {
    updateInFlight = false;
  });
}

function scheduleActiveChecks(): void {
  setTimeout(() => {
    checksEnabled = true;
  }, STARTUP_GRACE_MS);
  setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") checkForUpdate();
  });
}

export function initServiceWorker(callbacks: { onNeedRefresh: () => void }): void {
  updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      callbacks.onNeedRefresh();
    },
    onRegistered(swRegistration) {
      registration = swRegistration;
      scheduleActiveChecks();
    },
  });
}

export async function applyServiceWorkerUpdate(): Promise<void> {
  if (updateSW) {
    await updateSW(true);
  } else if (registration?.waiting) {
    registration.waiting.postMessage({ type: "SKIP_WAITING" });
  } else {
    window.location.reload();
  }
}
