import { persistentStorage } from "./safeStorage";
const MARQUEE_SPEED_PX_PER_SEC = 70;
const MARQUEE_MIN_DURATION_SEC = 8;

function applyMarquee(banner: HTMLElement): void {
  const track = banner.querySelector<HTMLElement>("[data-marquee]");
  const line = track?.querySelector<HTMLElement>(".notice-banner__line");
  const original = line?.firstElementChild as HTMLElement | null;
  if (!track || !line || !original) return;
  const fits = original.getBoundingClientRect().width <= track.clientWidth;
  banner.classList.toggle("notice-banner--marquee", !fits);
  if (fits) {
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
}

function primeNoticeMarquee(banner: HTMLElement): void {
  const track = banner.querySelector<HTMLElement>("[data-marquee]");
  if (!track) return;
  const run = () => applyMarquee(banner);
  run();
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(run).observe(track);
  (document as { fonts?: { ready?: Promise<unknown> } }).fonts?.ready?.then(run);
}

function isNoticeDismissed(storageKey: string, batchId: string): boolean {
  return Boolean(batchId) && persistentStorage.getItem(storageKey) === batchId;
}

export function primeNoticeBanner(banner: HTMLElement, storageKey: string): void {
  const batchId = banner.dataset.batchId || "";
  if (isNoticeDismissed(storageKey, batchId)) {
    banner.remove();
    return;
  }
  banner.classList.add("notice-banner--live");
  banner.querySelector<HTMLButtonElement>("[data-notice-dismiss]")?.addEventListener("click", () => {
    if (batchId) persistentStorage.setItem(storageKey, batchId);
    banner.remove();
  });
  primeNoticeMarquee(banner);
}
