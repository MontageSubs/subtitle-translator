import { registerSW } from "virtual:pwa-register";

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

let registration: ServiceWorkerRegistration | undefined;
let updateSW: ((reloadPage?: boolean) => Promise<void>) | undefined;

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
