import { docPages, docCategories } from "virtual:docs-content";
import { getRoute } from '../router/router';
import { getLocale, t } from "../i18n";
import { setPageMeta } from '../config/head';
import { renderDocsListBody, renderDocsListItems, renderDocsDetailBody, renderDocsMissingBody, SortMode } from "../render/docsMarkup";
import { offlineSearchMatch, stripHtmlToText } from "../utils/offlineSearch";

const ANNOUNCEMENT_SLUG = "announcement";

function renderList(container: HTMLElement): void {
  const locale = getLocale();
  let mode: SortMode = "newest";
  let query = "";
  const localePages = docPages.filter((page) => page.locale === locale && page.slug !== ANNOUNCEMENT_SLUG);

  function filteredPages() {
    if (!query.trim()) return localePages;
    return localePages.filter((page) => offlineSearchMatch(query, page.title, stripHtmlToText(page.html)));
  }

  function drawItems(): void {
    const itemsEl = container.querySelector<HTMLElement>("#docs-list-items")!;
    const matchCountEl = container.querySelector<HTMLElement>("#docs-match-count")!;
    const results = filteredPages();
    itemsEl.innerHTML = renderDocsListItems(locale, import.meta.env.BASE_URL, results, mode);
    matchCountEl.textContent = query.trim() ? t("docs.matchCount", { count: results.length }) : "";
  }

  function draw(): void {
    container.innerHTML = renderDocsListBody(locale, import.meta.env.BASE_URL, docCategories, filteredPages(), mode, query);

    container.querySelector<HTMLInputElement>("#docs-search-input")?.addEventListener("input", (event) => {
      query = (event.target as HTMLInputElement).value;
      drawItems();
    });

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
