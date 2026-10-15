import { persistentStorage } from "../utils/safeStorage";
import { COMPACT_LAYOUT_ATTRIBUTE, COMPACT_LAYOUT_CACHE_KEY, COMPACT_LAYOUT_CACHE_LIMIT, COMPACT_LAYOUT_VALUE, MOBILE_MEDIA_QUERY } from "../config/breakpoints";

const FIT_SELECTORS = [".site-header__inner", ".site-footer__inner"];

const overflowsHorizontally = (element: Element | null): boolean => element !== null && element.scrollWidth > element.clientWidth;

export const isCompactLayout = (): boolean =>
  document.documentElement.getAttribute(COMPACT_LAYOUT_ATTRIBUTE) === COMPACT_LAYOUT_VALUE || window.matchMedia(MOBILE_MEDIA_QUERY).matches;

function rememberCompactLayout(compact: boolean): void {
  const cache = persistentStorage.readJson<Record<string, 0 | 1>>(COMPACT_LAYOUT_CACHE_KEY) ?? {};
  const key = `${document.documentElement.lang}:${window.innerWidth}`;
  const entries = Object.entries({ ...cache, [key]: compact ? 1 : 0 }).slice(-COMPACT_LAYOUT_CACHE_LIMIT);
  persistentStorage.writeJson(COMPACT_LAYOUT_CACHE_KEY, Object.fromEntries(entries));
}

export function measureCompactLayout(): void {
  const root = document.documentElement;
  root.removeAttribute(COMPACT_LAYOUT_ATTRIBUTE);
  const compact = FIT_SELECTORS.some((selector) => overflowsHorizontally(document.querySelector(selector)));
  if (compact) root.setAttribute(COMPACT_LAYOUT_ATTRIBUTE, COMPACT_LAYOUT_VALUE);
  rememberCompactLayout(compact);
}

export function mountCompactLayout(): void {
  let width = 0;
  new ResizeObserver(([entry]) => {
    if (entry!.contentRect.width === width) return;
    width = entry!.contentRect.width;
    measureCompactLayout();
  }).observe(document.documentElement);
  void document.fonts?.ready.then(measureCompactLayout);
}
