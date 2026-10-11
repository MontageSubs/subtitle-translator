export type ScopedQuery = <T extends HTMLElement>(selector: string) => T;

export function scopedQuery(root: ParentNode): ScopedQuery {
  return <T extends HTMLElement>(selector: string) => root.querySelector(selector) as T;
}

export function scrollToElement(element: HTMLElement, block: ScrollLogicalPosition = "start"): void {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  element.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block });
}
