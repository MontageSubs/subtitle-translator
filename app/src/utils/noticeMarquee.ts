const SCROLL_PX_PER_SEC = 45;

export function isNoticeDismissed(storageKey: string, batchId: string, useLocalStorage = false): boolean {
  if (!batchId) return false;
  try {
    return (useLocalStorage ? localStorage : sessionStorage).getItem(storageKey) === batchId;
  } catch {
    return false;
  }
}

export function primeNoticeBar(bar: HTMLElement, storageKey: string, useLocalStorage = false): void {
  const store = useLocalStorage ? localStorage : sessionStorage;
  const batchId = bar.dataset.batchId || "";
  if (isNoticeDismissed(storageKey, batchId, useLocalStorage)) {
    bar.remove();
    return;
  }

  const track = bar.querySelector<HTMLElement>(".notice-bar__track");
  const scrollEl = bar.querySelector<HTMLElement>(".notice-bar__scroll");
  if (scrollEl && track) {
    const singleCopyWidth = scrollEl.scrollWidth / 2;
    if (singleCopyWidth <= track.clientWidth) {
      scrollEl.classList.add("notice-bar__scroll--static");
      const children = Array.from(scrollEl.children);
      children.slice(children.length / 2).forEach((el) => el.remove());
    } else {
      const durationSec = Math.max(8, singleCopyWidth / SCROLL_PX_PER_SEC);
      scrollEl.style.animationDuration = `${durationSec}s`;
    }
  }

  bar.querySelector<HTMLButtonElement>("[data-notice-dismiss]")?.addEventListener("click", () => {
    try {
      if (batchId) store.setItem(storageKey, batchId);
    } catch {
      // storage unavailable, dismissal just won't persist
    }
    bar.remove();
  });
}
