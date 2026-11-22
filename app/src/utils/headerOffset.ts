const HEADER_HEIGHT_PROPERTY = "--header-height";

let observer: ResizeObserver | null = null;

export function trackHeaderHeight(header: Element | null): void {
  observer?.disconnect();
  observer = null;
  if (!header || typeof ResizeObserver === "undefined") return;
  observer = new ResizeObserver(() => document.documentElement.style.setProperty(HEADER_HEIGHT_PROPERTY, `${header.getBoundingClientRect().height}px`));
  observer.observe(header);
}
