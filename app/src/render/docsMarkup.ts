import { labelAttrs } from "../utils/labelAttrs";
import { escapeHtml } from "../utils/escapeHtml";
import { DocPage } from "../types/docs";
import { LocaleCode } from "../i18n/locales.config";
import { translate } from "../i18n/dictionaries";
import { formatDate } from "../utils/localeFormat";
import { PIN_ICON, SORT_ICON, CLOSE_ICON, renderDirectionArrow } from "./icons";
import { routePath, joinPath } from "./paths";
import { REPO_URL } from '../config/social';
import { renderDocDetail } from "./docDetail";

export type SortMode = "newest" | "oldest" | "az" | "za";
export const DOCS_PAGE_SIZE = 20;
const PAGER_EDGE_PAGES = 1;
const PAGER_SIBLING_PAGES = 1;
const SORT_MODES: SortMode[] = ["newest", "oldest", "az", "za"];

function sortPages(pages: DocPage[], mode: SortMode, locale?: LocaleCode): DocPage[] {
  const compare: Record<SortMode, (a: DocPage, b: DocPage) => number> = {
    newest: (a, b) => (b.updatedAt || b.createdAt || "").localeCompare(a.updatedAt || a.createdAt || "") || a.title.localeCompare(b.title, locale),
    oldest: (a, b) => (a.updatedAt || a.createdAt || "").localeCompare(b.updatedAt || b.createdAt || "") || a.title.localeCompare(b.title, locale),
    az: (a, b) => a.title.localeCompare(b.title, locale),
    za: (a, b) => b.title.localeCompare(a.title, locale),
  };
  const pinned = pages.filter((p) => p.pinned).sort(compare[mode]);
  const rest = pages.filter((p) => !p.pinned).sort(compare[mode]);
  return [...pinned, ...rest];
}

export interface DocsPageSlice {
  items: DocPage[];
  page: number;
  pageCount: number;
}

export function paginateDocs(pages: DocPage[], mode: SortMode, locale: LocaleCode, requestedPage: number): DocsPageSlice {
  const sorted = sortPages(pages, mode, locale);
  const pageCount = Math.max(1, Math.ceil(sorted.length / DOCS_PAGE_SIZE));
  const page = Math.min(Math.max(1, requestedPage), pageCount);
  return { items: sorted.slice((page - 1) * DOCS_PAGE_SIZE, page * DOCS_PAGE_SIZE), page, pageCount };
}

function pagerWindow(page: number, pageCount: number): Array<number | null> {
  const visible = new Set<number>();
  for (let n = 1; n <= PAGER_EDGE_PAGES; n++) visible.add(n).add(pageCount - n + 1);
  for (let n = page - PAGER_SIBLING_PAGES; n <= page + PAGER_SIBLING_PAGES; n++) visible.add(n);
  const ordered = [...visible].filter((n) => n >= 1 && n <= pageCount).sort((a, b) => a - b);
  return ordered.flatMap((n, index) => (index > 0 && n - ordered[index - 1]! > 1 ? [null, n] : [n]));
}

export function renderDocsPager(locale: LocaleCode, page: number, pageCount: number): string {
  if (pageCount <= 1) return "";
  const tr = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) => translate(locale, key, params);
  const step = (target: number, label: string, arrow: string, disabled: boolean) =>
    `<button type="button" class="doc-pager__button doc-pager__button--step" data-docs-page="${target}" ${labelAttrs(label)}${disabled ? " disabled" : ""}>${arrow}</button>`;
  const numbers = pagerWindow(page, pageCount).map((n) => n === null
    ? `<span class="doc-pager__gap" aria-hidden="true">…</span>`
    : `<button type="button" class="doc-pager__button${n === page ? " doc-pager__button--active" : ""}" data-docs-page="${n}"${n === page ? ' aria-current="page"' : ""} ${labelAttrs(tr("docs.pager.page", { page: n }))}>${n}</button>`).join("");
  return `<nav class="doc-pager" aria-label="${tr("docs.pager.label")}">
    ${step(page - 1, tr("docs.pager.prev"), renderDirectionArrow(14, "direction-arrow-icon direction-arrow-icon--back"), page <= 1)}
    ${numbers}
    ${step(page + 1, tr("docs.pager.next"), renderDirectionArrow(14), page >= pageCount)}
    <span class="sr-only" aria-live="polite">${tr("docs.pager.status", { page, total: pageCount })}</span>
  </nav>`;
}

function avatarStack(page: DocPage, size: "sm" | "lg", basePath: string): string {
  if (!page.authors.length) return "";
  const avatars = page.authors
    .slice()
    .reverse()
    .map(
      (author, index) => `
        <span class="avatar-stack__item" style="z-index:${index}">
          <img src="${joinPath(basePath, [author.avatarUrl])}" width="32" height="32" alt="" loading="lazy" />
          <span class="avatar-stack__name">${author.login}</span>
        </span>
      `
    )
    .join("");
  return `<span class="avatar-stack avatar-stack--${size}">${avatars}</span>`;
}

function renderDocDate(key: "docs.createdOn" | "docs.updatedOn", value: string | number, locale: LocaleCode): string {
  const formatted = formatDate(value, locale);
  const date = `<time datetime="${escapeHtml(new Date(value).toISOString())}" title="${escapeHtml(formatted)}" data-relative>${escapeHtml(formatted)}</time>`;
  return `<span>${translate(locale, key, { date })}</span>`;
}

function authorBadge(page: DocPage, size: "sm" | "lg", locale: LocaleCode, basePath: string, linkable: boolean): string {
  const stack = avatarStack(page, size, basePath);
  if (!stack) return "";
  if (!linkable) return stack;
  return `<a href="${REPO_URL}/graphs/contributors" target="_blank" rel="noopener" ${labelAttrs(translate(locale, "docs.contributors"))}>${stack}</a>`;
}

function renderDocItem(page: DocPage, locale: LocaleCode, basePath: string): string {
  const tr = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) => translate(locale, key, params);
  const href = page.route && page.route !== "docs"
    ? routePath(basePath, [locale, page.route])
    : routePath(basePath, [locale, "docs", page.slug]);
  return `
    <li>
      <a class="doc-list__item" href="${href}">
        <span class="doc-list__main">
          ${page.pinned ? `<span class="doc-list__pin" title="${tr("docs.pinnedLabel")}">${PIN_ICON}</span>` : ""}
          <span class="doc-list__title" title="${escapeHtml(page.title)}">${escapeHtml(page.title)}</span>
        </span>
        <span class="doc-meta">
          ${authorBadge(page, "sm", locale, basePath, false)}
          ${page.updatedAt ? renderDocDate("docs.updatedOn", page.updatedAt, locale) : ""}
        </span>
      </a>
    </li>
  `;
}

export function renderDocsListItems(locale: LocaleCode, basePath: string, pages: DocPage[], mode: SortMode): string {
  const tr = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const pinnedPages = sortPages(pages.filter((p) => p.pinned), mode, locale);
  const regularPages = sortPages(pages.filter((p) => !p.pinned), mode, locale);

  if (!pinnedPages.length && !regularPages.length) {
    return `<p class="muted docs-empty">${tr("docs.noResults")}</p>`;
  }

  const pinnedHtml = pinnedPages.length
    ? `<ul class="doc-list doc-list--pinned">${pinnedPages.map((page) => renderDocItem(page, locale, basePath)).join("")}</ul>`
    : "";
  const regularHtml = regularPages.length
    ? `<ul class="doc-list doc-list--regular">${regularPages.map((page) => renderDocItem(page, locale, basePath)).join("")}</ul>`
    : "";

  return pinnedHtml + regularHtml;
}

export function renderDocsListBody(locale: LocaleCode, basePath: string, pages: DocPage[], mode: SortMode, query = "", pageNumber?: number): string {
  const slice = pageNumber === undefined ? null : paginateDocs(pages, mode, locale, pageNumber);
  const tr = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) => translate(locale, key, params);

  return `
    <section class="step">
      <div class="step__head">
        <h1>${tr("page.docs.title")}</h1>
        <div class="sort-menu" data-requires-js>
          <details>
            <summary class="sort-menu__trigger" ${labelAttrs(tr("docs.sort.label"))}>${SORT_ICON}</summary>
            <div class="sort-menu__popover">
              ${SORT_MODES.map((m) => `<a class="sort-menu__option${m === mode ? " sort-menu__option--active" : ""}" href="#" data-sort="${m}">${tr(`docs.sort.${m}` as any)}</a>`).join("")}
            </div>
          </details>
        </div>
      </div>
      <div class="search-row" data-requires-js>
        <div class="search-field">
          <input type="search" id="docs-search-input" class="doc-search-input" role="searchbox" value="${escapeHtml(query)}" placeholder="${tr("docs.searchPlaceholder")}" aria-label="${tr("docs.searchPlaceholder")}" />
          <button type="button" class="preview-search-clear icon-btn" id="docs-search-clear" ${labelAttrs(tr("preview.clearSearch"))} ${query ? "" : "hidden"}>${CLOSE_ICON}</button>
        </div>
        <span class="search-match-count" id="docs-match-count" aria-live="polite">${query.trim() ? tr("docs.matchCount", { count: pages.length }) : ""}</span>
      </div>
      <div id="docs-list-items">${renderDocsListItems(locale, basePath, slice ? slice.items : pages, mode)}</div>
      <div id="docs-pager" data-requires-js>${slice ? renderDocsPager(locale, slice.page, slice.pageCount) : ""}</div>
    </section>
  `;
}

function renderBackToList(locale: LocaleCode, basePath: string, className: string): string {
  return `<a class="secondary ${className}" href="${routePath(basePath, [locale, "docs"])}">${renderDirectionArrow(14, "direction-arrow-icon direction-arrow-icon--back")}${translate(locale, "docs.backToList")}</a>`;
}

export function renderDocsDetailBody(locale: LocaleCode, basePath: string, page: DocPage): string {
  const footer = `<div class="doc-meta doc-meta--footer">
        ${authorBadge(page, "lg", locale, basePath, true)}
        ${page.createdAt ? renderDocDate("docs.createdOn", page.createdAt, locale) : ""}
        ${page.updatedAt ? renderDocDate("docs.updatedOn", page.updatedAt, locale) : ""}
      </div>`;
  return renderDocDetail(locale, page, { backLink: renderBackToList(locale, basePath, "doc-detail__back"), footer });
}
