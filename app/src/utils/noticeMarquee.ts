export function isNoticeDismissed(storageKey: string, batchId: string): boolean {
  if (!batchId) return false;
  try {
    return localStorage.getItem(storageKey) === batchId;
  } catch {
    return false;
  }
}

export function primeNoticeBanner(banner: HTMLElement, storageKey: string): void {
  const batchId = banner.dataset.batchId || "";
  if (isNoticeDismissed(storageKey, batchId)) {
    banner.remove();
    return;
  }
  banner.querySelector<HTMLButtonElement>("[data-notice-dismiss]")?.addEventListener("click", () => {
    try {
      if (batchId) localStorage.setItem(storageKey, batchId);
    } catch {
      return;
    }
    banner.remove();
  });
}
