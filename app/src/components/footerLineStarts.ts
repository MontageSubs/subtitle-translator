const WRAPPING_LIST_SELECTOR = ".footer-links, .footer-copyright-wrap";
const LINE_START_ATTRIBUTE = "data-line-start";
const WRAPPED_ATTRIBUTE = "data-wrapped";

let observer: ResizeObserver | null = null;

function markLineStarts(list: Element): void {
  let previousBottom = Number.NEGATIVE_INFINITY;
  let lineCount = 0;
  for (const item of list.children) {
    const { top, bottom } = item.getBoundingClientRect();
    const startsLine = top >= previousBottom;
    if (startsLine) lineCount += 1;
    item.toggleAttribute(LINE_START_ATTRIBUTE, startsLine);
    previousBottom = bottom;
  }
  list.toggleAttribute(WRAPPED_ATTRIBUTE, lineCount > 1);
}

export function observeFooterLineStarts(): void {
  observer?.disconnect();
  observer = new ResizeObserver((entries) => entries.forEach((entry) => markLineStarts(entry.target)));
  document.querySelectorAll(WRAPPING_LIST_SELECTOR).forEach((list) => observer!.observe(list));
}
