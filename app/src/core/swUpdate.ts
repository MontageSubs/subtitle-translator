import { registerSW } from "virtual:pwa-register";

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

let registration: ServiceWorkerRegistration | undefined;

function scheduleActiveChecks(): void {
  setInterval(() => {
    void registration?.update();
  }, UPDATE_CHECK_INTERVAL_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void registration?.update();
    }
  });
}

export function initServiceWorker(callbacks: { onNeedRefresh: () => void }): void {
  let refreshing = false;

  if ("serviceWorker" in navigator) {
    const hasController = Boolean(navigator.serviceWorker.controller);

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (hasController && !refreshing) {
        refreshing = true;
        callbacks.onNeedRefresh();
      }
    });
  }

  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      if (navigator.serviceWorker.controller && !refreshing) {
        refreshing = true;
        callbacks.onNeedRefresh();
      }
    },
    onRegistered(swRegistration) {
      registration = swRegistration;
      scheduleActiveChecks();
    },
  });

  void updateSW;
}

export function applyServiceWorkerUpdate(): void {
  window.location.reload();
}
