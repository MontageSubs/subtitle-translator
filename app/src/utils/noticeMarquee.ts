import { persistentStorage } from "./safeStorage";

const MARQUEE_SPEED_PX_PER_SEC = 70;
const MARQUEE_MIN_DURATION_SEC = 8;
const HYSTERESIS_PX = 2;

function isNoticeDismissed(storageKey: string, batchId: string): boolean {
  return Boolean(batchId) && persistentStorage.getItem(storageKey) === batchId;
}

function primeNoticeMarquee(banner: HTMLElement): () => void {
  const track = banner.querySelector<HTMLElement>("[data-marquee]");
  const line = track?.querySelector<HTMLElement>(".notice-banner__line");
  const original = line?.firstElementChild as HTMLElement | null;
  if (!track || !line || !original) return () => {};

  let active = false;
  let rafId = 0;

  const update = (): void => {
    rafId = 0;
    const trackWidth = track.clientWidth;
    if (trackWidth <= 0) return;

    const contentWidth = original.scrollWidth;
    const shouldRun = active
      ? contentWidth > trackWidth + HYSTERESIS_PX
      : contentWidth > trackWidth;

    if (shouldRun === active) return;
    active = shouldRun;

    banner.classList.toggle("notice-banner--marquee", active);
    if (!active) {
      if (line.children.length > 1) line.lastElementChild?.remove();
      line.style.removeProperty("animation-duration");
      return;
    }

    if (line.children.length < 2) {
      const clone = original.cloneNode(true) as HTMLElement;
      clone.setAttribute("aria-hidden", "true");
      line.append(clone);
    }
    const duration = Math.max(MARQUEE_MIN_DURATION_SEC, line.scrollWidth / 2 / MARQUEE_SPEED_PX_PER_SEC);
    line.style.animationDuration = `${duration}s`;
  };

  const schedule = (): void => {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(update);
  };

  schedule();

  const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
  observer?.observe(track);

  (document as { fonts?: { ready?: Promise<unknown> } }).fonts?.ready?.then(schedule);

  return (): void => {
    if (rafId) cancelAnimationFrame(rafId);
    observer?.disconnect();
  };
}

export function primeNoticeBanner(banner: HTMLElement, storageKey: string): void {
  const batchId = banner.dataset.batchId || "";
  if (isNoticeDismissed(storageKey, batchId)) {
    banner.remove();
    return;
  }
  banner.classList.add("notice-banner--live");
  const teardown = primeNoticeMarquee(banner);
  banner.querySelector<HTMLButtonElement>("[data-notice-dismiss]")?.addEventListener("click", () => {
    if (batchId) persistentStorage.setItem(storageKey, batchId);
    teardown();
    banner.remove();
  });
}
