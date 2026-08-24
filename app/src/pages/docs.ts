import { docPages, docCategories } from "virtual:docs-content";
import { getRoute } from "../router";
import { getLocale, t } from "../i18n";
import { setPageMeta } from "../head";
import { renderDocsListBody, renderDocsDetailBody, renderDocsMissingBody, SortMode } from "../render/docsMarkup";

function renderList(container: HTMLElement): void {
  const locale = getLocale();
  let mode: SortMode = "newest";

  function draw(): void {
    container.innerHTML = renderDocsListBody(locale, import.meta.env.BASE_URL, docCategories, docPages, mode);

    container.querySelectorAll<HTMLAnchorElement>(".sort-menu [data-sort]").forEach((option) => {
      option.addEventListener("click", (event) => {
        event.preventDefault();
        mode = option.dataset.sort as SortMode;
        draw();
      });
    });
  }

  draw();
}

function renderDetail(container: HTMLElement, slug: string): void {
  const locale = getLocale();
  const page = docPages.find((p) => p.slug === slug && p.locale === locale);

  if (!page) {
    container.innerHTML = renderDocsMissingBody(locale, import.meta.env.BASE_URL);
    return;
  }

  container.innerHTML = renderDocsDetailBody(locale, import.meta.env.BASE_URL, page);
  setPageMeta(page.title, t("meta.docs.description"));
}

export function mount(container: HTMLElement, _signal: AbortSignal): void {
  const route = getRoute();
  const slug = route.rest[0];
  if (slug) renderDetail(container, slug);
  else renderList(container);
}
