const WRAPPING_LIST_SELECTOR = ".footer-links, .footer-copyright-wrap";
const LINE_START_ATTRIBUTE = "data-line-start";

let observer: ResizeObserver | null = null;

function markLineStarts(list: Element): void {
  let previousBottom = Number.NEGATIVE_INFINITY;
  for (const item of list.children) {
    const { top, bottom } = item.getBoundingClientRect();
    item.toggleAttribute(LINE_START_ATTRIBUTE, top >= previousBottom);
    previousBottom = bottom;
  }
}

export function observeFooterLineStarts(): void {
  observer?.disconnect();
  observer = new ResizeObserver((entries) => entries.forEach((entry) => markLineStarts(entry.target)));
  document.querySelectorAll(WRAPPING_LIST_SELECTOR).forEach((list) => observer!.observe(list));
}
