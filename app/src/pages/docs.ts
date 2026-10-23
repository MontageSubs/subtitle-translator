import { docPages } from "virtual:docs-content";
import { getRoute } from '../router/router';
import { getLocale, t } from "../i18n";
import { setPageMeta } from '../config/head';
import { renderDocsListBody, renderDocsListItems, renderDocsDetailBody, renderDocsMissingBody, renderDocsPager, paginateDocs, SortMode } from "../render/docsMarkup";
import { offlineSearchMatch, stripHtmlToText } from "../utils/offlineSearch";
import { ANNOUNCEMENT_CHANGED_EVENT, refreshHotAnnouncement, withHotAnnouncement } from "../api/announcementFeed";

function renderList(container: HTMLElement, signal: AbortSignal): void {
  const locale = getLocale();
  let mode: SortMode = "newest";
  let query = "";
  let pageNumber = 1;
  const loadPages = () => docPages.filter((page) => page.locale === locale).map(withHotAnnouncement);
  let localePages = loadPages();

  function filteredPages() {
    if (!query.trim()) return localePages;
    return localePages.filter((page) => offlineSearchMatch(query, page.title, stripHtmlToText(page.html)));
  }

  function drawItems(): void {
    const itemsEl = container.querySelector<HTMLElement>("#docs-list-items")!;
    const matchCountEl = container.querySelector<HTMLElement>("#docs-match-count")!;
    const results = filteredPages();
    const slice = paginateDocs(results, mode, locale, pageNumber);
    pageNumber = slice.page;
    itemsEl.innerHTML = renderDocsListItems(locale, import.meta.env.BASE_URL, slice.items, mode);
    container.querySelector<HTMLElement>("#docs-pager")!.innerHTML = renderDocsPager(locale, slice.page, slice.pageCount);
    matchCountEl.textContent = query.trim() ? t("docs.matchCount", { count: results.length }) : "";
  }

  function draw(): void {
    container.innerHTML = renderDocsListBody(locale, import.meta.env.BASE_URL, filteredPages(), mode, query, pageNumber);

    function syncSearchClear(): void {
      const clearBtn = container.querySelector<HTMLButtonElement>("#docs-search-clear")!;
      clearBtn.hidden = query.length === 0;
    }

    container.querySelector<HTMLInputElement>("#docs-search-input")?.addEventListener("input", (event) => {
      query = (event.target as HTMLInputElement).value;
      pageNumber = 1;
      syncSearchClear();
      drawItems();
    });

    container.querySelector<HTMLButtonElement>("#docs-search-clear")?.addEventListener("click", () => {
      const input = container.querySelector<HTMLInputElement>("#docs-search-input")!;
      input.value = "";
      query = "";
      pageNumber = 1;
      syncSearchClear();
      input.focus();
      drawItems();
    });

    container.querySelector<HTMLElement>("#docs-pager")?.addEventListener("click", (event) => {
      const target = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-docs-page]");
      if (!target || target.disabled) return;
      pageNumber = Number(target.dataset.docsPage);
      drawItems();
      container.querySelector<HTMLElement>(".doc-pager__button--active")?.focus({ preventScroll: true });
      container.querySelector<HTMLElement>(".step__head")?.scrollIntoView({ block: "start" });
    });

    container.querySelectorAll<HTMLAnchorElement>(".sort-menu [data-sort]").forEach((option) => {
      option.addEventListener("click", (event) => {
        event.preventDefault();
        mode = option.dataset.sort as SortMode;
        pageNumber = 1;
        draw();
      });
    });
  }

  window.addEventListener(ANNOUNCEMENT_CHANGED_EVENT, () => {
    localePages = loadPages();
    draw();
  }, { signal });
  draw();
  if (localePages.some((page) => page.hotShell)) void refreshHotAnnouncement(locale);
}

function renderDetail(container: HTMLElement, slug: string, signal: AbortSignal): void {
  const locale = getLocale();
  const source = docPages.find((p) => p.slug === slug && p.locale === locale);
  const page = source && withHotAnnouncement(source);

  if (!page) {
    container.innerHTML = renderDocsMissingBody(locale, import.meta.env.BASE_URL);
    return;
  }

  const keepPrerendered = page.hotShell && container.querySelector(".doc-detail__body") !== null;
  if (!keepPrerendered) {
    container.innerHTML = renderDocsDetailBody(locale, import.meta.env.BASE_URL, page);
    setPageMeta(page.title, t("meta.docs.description"));
  }
  if (!source?.siteWide) return;
  window.addEventListener(ANNOUNCEMENT_CHANGED_EVENT, () => renderDetail(container, slug, signal), { signal, once: true });
  if (page.hotShell) void refreshHotAnnouncement(locale);
}

export function mount(container: HTMLElement, signal: AbortSignal): void {
  const route = getRoute();
  const slug = route.rest[0];
  if (slug) renderDetail(container, slug, signal);
  else renderList(container, signal);
}
