import { prefersTouchInput } from "./touchInput";
import { isCompactLayout } from "./compactLayout";
import { directionOfText } from "./textDirection";

const TRUNCATABLE_SELECTOR = "[data-truncatable]";
const FILE_NAME_HEAD_SELECTOR = ".fname__head";
const RUNNING_ATTRIBUTE = "data-marquee-running";
const CLIPPED_ATTRIBUTE = "data-clipped";
const ELLIPSIS = "…";
const MARQUEE_DELAY_MS = 3000;
const MARQUEE_END_HOLD_MS = 1000;
const MARQUEE_MIN_DURATION_MS = 1000;
const MARQUEE_SPEED_PX_PER_SEC = 70;
const FIT_TOLERANCE_PX = 0.5;

const tracked = new Set<HTMLElement>();
const timers = new Map<HTMLElement, number>();
const runs = new Map<HTMLElement, { run: HTMLElement; animation: Animation | null }>();
let fitFrame = 0;
let measuringContext: CanvasRenderingContext2D | null | undefined;
let parentObserver: ResizeObserver | null = null;

const headOf = (element: HTMLElement): HTMLElement | null => element.querySelector<HTMLElement>(FILE_NAME_HEAD_SELECTOR);

const marqueeAllowed = (): boolean => prefersTouchInput() || isCompactLayout();

function measuringFont(style: CSSStyleDeclaration): string {
  return `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
}

function widthOf(context: CanvasRenderingContext2D, text: string, letterSpacing: number): number {
  return context.measureText(text).width + Array.from(text).length * letterSpacing;
}

function fittedWidth(head: HTMLElement, available: number): number | null {
  measuringContext ??= document.createElement("canvas").getContext("2d");
  if (!measuringContext) return null;
  const style = getComputedStyle(head);
  measuringContext.font = measuringFont(style);
  const letterSpacing = Number.parseFloat(style.letterSpacing) || 0;
  const points = Array.from(head.textContent ?? "");
  const widthWith = (count: number): number => widthOf(measuringContext!, points.slice(0, count).join("") + ELLIPSIS, letterSpacing);
  if (widthWith(0) > available) return null;
  let low = 0;
  let high = points.length;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (widthWith(middle) <= available) low = middle;
    else high = middle - 1;
  }
  return widthWith(low) + FIT_TOLERANCE_PX;
}

function fitAll(): void {
  fitFrame = 0;
  for (const element of tracked) {
    if (!element.isConnected) {
      forget(element);
      continue;
    }
    if (!runs.has(element)) headOf(element)?.style.removeProperty("max-width");
  }
  const measured = [...tracked]
    .filter((element) => !runs.has(element))
    .map((element) => {
      const head = headOf(element);
      const box = head ?? element;
      const clipped = box.scrollWidth - box.clientWidth > FIT_TOLERANCE_PX;
      return { element, head, clipped, width: head && clipped ? fittedWidth(head, box.clientWidth) : null };
    });
  for (const { element, head, clipped, width } of measured) {
    if (head && width !== null) head.style.maxWidth = `${width}px`;
    element.toggleAttribute(CLIPPED_ATTRIBUTE, clipped);
    if (clipped) scheduleMarquee(element);
    else cancelTimer(element);
  }
}

function scheduleFit(): void {
  if (!fitFrame) fitFrame = requestAnimationFrame(fitAll);
}

function cancelTimer(element: HTMLElement): void {
  const timer = timers.get(element);
  if (timer === undefined) return;
  clearTimeout(timer);
  timers.delete(element);
}

function forget(element: HTMLElement): void {
  cancelTimer(element);
  runs.get(element)?.animation?.cancel();
  runs.delete(element);
  tracked.delete(element);
}

function isOnScreen(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  return !document.hidden && rect.width > 0 && rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth;
}

function scheduleMarquee(element: HTMLElement): void {
  if (timers.has(element) || runs.has(element)) return;
  timers.set(element, window.setTimeout(() => {
    timers.delete(element);
    if (!element.isConnected || !element.hasAttribute(CLIPPED_ATTRIBUTE)) return;
    if (marqueeAllowed() && isOnScreen(element)) startMarquee(element);
    else scheduleMarquee(element);
  }, MARQUEE_DELAY_MS));
}

function startMarquee(element: HTMLElement): void {
  const run = document.createElement("span");
  run.className = "marquee-run";
  run.append(...element.childNodes);
  element.append(run);
  element.setAttribute(RUNNING_ATTRIBUTE, "");
  const state: { run: HTMLElement; animation: Animation | null } = { run, animation: null };
  runs.set(element, state);
  const distance = run.scrollWidth - element.clientWidth;
  if (distance <= 1) {
    stopMarquee(element);
    return;
  }
  const direction = directionOfText(element.textContent ?? "") === "rtl" ? 1 : -1;
  state.animation = run.animate(
    [{ transform: "translateX(0)" }, { transform: `translateX(${direction * distance}px)` }],
    { duration: Math.max(MARQUEE_MIN_DURATION_MS, (distance / MARQUEE_SPEED_PX_PER_SEC) * 1000), easing: "linear", fill: "forwards" },
  );
  state.animation.finished
    .then(() => new Promise<void>((resolve) => window.setTimeout(resolve, MARQUEE_END_HOLD_MS)))
    .then(() => stopMarquee(element), () => {});
}

function stopMarquee(element: HTMLElement): void {
  const state = runs.get(element);
  if (!state) return;
  state.animation?.cancel();
  runs.delete(element);
  if (state.run.parentNode === element) {
    element.append(...state.run.childNodes);
    state.run.remove();
  }
  element.removeAttribute(RUNNING_ATTRIBUTE);
  scheduleFit();
}

function alignWithOwnText(element: HTMLElement): void {
  if (element.hasAttribute("dir")) return;
  element.dir = directionOfText(element.textContent ?? "");
}

function track(element: HTMLElement): void {
  if (tracked.has(element)) return;
  tracked.add(element);
  alignWithOwnText(element);
  parentObserver?.observe(element.parentElement ?? element);
}

function trackWithin(node: Node): boolean {
  if (!(node instanceof Element)) return false;
  const found = [...(node.matches(TRUNCATABLE_SELECTOR) ? [node as HTMLElement] : []), ...node.querySelectorAll<HTMLElement>(TRUNCATABLE_SELECTOR)];
  found.forEach(track);
  return found.length > 0;
}

export function installTruncatedText(): void {
  parentObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleFit);
  new MutationObserver((mutations) => {
    const added = mutations.flatMap(({ addedNodes }) => [...addedNodes]).map(trackWithin);
    if (added.some(Boolean)) scheduleFit();
  }).observe(document.documentElement, { childList: true, subtree: true });
  trackWithin(document.documentElement);
  window.addEventListener("resize", scheduleFit);
  (document as { fonts?: { ready?: Promise<unknown> } }).fonts?.ready?.then(scheduleFit);
  scheduleFit();
}
