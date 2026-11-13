const TRUNCATABLE_SELECTOR = "[data-truncatable]";

export function installTruncationTitles(): void {
  document.addEventListener("mouseover", (event) => {
    const element = event.target instanceof Element ? event.target.closest<HTMLElement>(TRUNCATABLE_SELECTOR) : null;
    if (!element) return;
    const measured = element.hasAttribute("data-filename") ? element.querySelector<HTMLElement>(".fname__head") ?? element : element;
    if (measured.scrollWidth > measured.clientWidth) element.title = element.textContent ?? "";
    else element.removeAttribute("title");
  });
}
