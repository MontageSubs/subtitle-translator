export function revealTruncatedTextOnHover(root: HTMLElement, selector: string, signal: AbortSignal): void {
  root.addEventListener(
    "mouseover",
    (event) => {
      const element = event.target instanceof Element ? event.target.closest<HTMLElement>(selector) : null;
      if (!element) return;
      if (element.scrollWidth > element.clientWidth) element.title = element.textContent ?? "";
      else element.removeAttribute("title");
    },
    { signal },
  );
}
