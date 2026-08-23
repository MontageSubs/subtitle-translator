import { registerSW } from "virtual:pwa-register";

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

type ApplyUpdate = (reloadPage?: boolean) => Promise<void>;

let applyUpdate: ApplyUpdate = async () => {};
let registration: ServiceWorkerRegistration | undefined;

function scheduleActiveChecks(): void {
  setInterval(() => registration?.update(), UPDATE_CHECK_INTERVAL_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") registration?.update();
  });
}

export function initServiceWorker(callbacks: { onNeedRefresh: () => void; onOfflineReady: () => void }): void {
  applyUpdate = registerSW({
    onNeedRefresh() {
      if (!navigator.serviceWorker.controller) return;
      callbacks.onNeedRefresh();
    },
    onOfflineReady: callbacks.onOfflineReady,
    onRegistered(swRegistration) {
      registration = swRegistration;
      scheduleActiveChecks();
    },
  });
}

export function applyServiceWorkerUpdate(): void {
  void applyUpdate(true);
}
