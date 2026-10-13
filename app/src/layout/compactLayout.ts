import { COMPACT_LAYOUT_ATTRIBUTE, COMPACT_LAYOUT_VALUE, MOBILE_MEDIA_QUERY } from "../config/breakpoints";

const FIT_SELECTORS = [".site-header__inner", ".site-footer__inner"];

const overflowsHorizontally = (element: Element | null): boolean => element !== null && element.scrollWidth > element.clientWidth;

export const isCompactLayout = (): boolean =>
  document.documentElement.getAttribute(COMPACT_LAYOUT_ATTRIBUTE) === COMPACT_LAYOUT_VALUE || window.matchMedia(MOBILE_MEDIA_QUERY).matches;

export function measureCompactLayout(): void {
  const root = document.documentElement;
  root.removeAttribute(COMPACT_LAYOUT_ATTRIBUTE);
  if (FIT_SELECTORS.some((selector) => overflowsHorizontally(document.querySelector(selector)))) {
    root.setAttribute(COMPACT_LAYOUT_ATTRIBUTE, COMPACT_LAYOUT_VALUE);
  }
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
