import { DocPage } from "../../vite-plugins/docsContent";
import { LocaleCode } from "../i18n/locales.config";
import { translate } from "../i18n/dictionaries";
import { LOCALE_LABELS } from '../config/localeLabels';
import { PIN_ICON, SORT_ICON } from "./icons";
import { routePath } from "./paths";
import { REPO_URL } from '../config/social';

export type SortMode = "newest" | "oldest" | "az" | "za";
export const SORT_MODES: SortMode[] = ["newest", "oldest", "az", "za"];

function sourceLocaleLabel(page: DocPage): string {
  return LOCALE_LABELS[page.sourceLocale as LocaleCode] ?? page.sourceLocale;
}

export function sortPages(pages: DocPage[], mode: SortMode, locale?: LocaleCode): DocPage[] {
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

function avatarStack(page: DocPage, size: "sm" | "lg"): string {
  if (!page.authors.length) return "";
  const avatars = page.authors
    .slice()
    .reverse()
    .map(
      (author, index) => `
        <span class="avatar-stack__item" style="z-index:${index}">
          <img src="${author.avatarUrl}" alt="" loading="lazy" />
          <span class="avatar-stack__name">${author.login}</span>
        </span>
      `
    )
    .join("");
  return `<span class="avatar-stack avatar-stack--${size}">${avatars}</span>`;
}

function authorBadge(page: DocPage, size: "sm" | "lg", locale: LocaleCode, linkable: boolean): string {
  const stack = avatarStack(page, size);
  if (!stack) return "";
  if (!linkable) return stack;
  return `<a href="${REPO_URL}/graphs/contributors" target="_blank" rel="noopener" aria-label="${translate(locale, "docs.contributors")}">${stack}</a>`;
}

function formatDate(locale: LocaleCode, isoOrMs: string): string {
  if (!isoOrMs) return "";
  const intlLocale = { "zh-Hans": "zh-CN", "zh-Hant": "zh-TW", en: "en-US" }[locale];
  return new Intl.DateTimeFormat(intlLocale, { dateStyle: "medium" }).format(new Date(isoOrMs));
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
          <span class="doc-list__title">${page.title}</span>
          ${page.isFallback ? `<span class="doc-list__badge">${tr("docs.fallbackBadge", { locale: sourceLocaleLabel(page) })}</span>` : ""}
        </span>
        <span class="doc-meta">
          ${authorBadge(page, "sm", locale, false)}
          ${page.updatedAt ? `<span>${tr("docs.updatedOn", { date: formatDate(locale, page.updatedAt) })}</span>` : ""}
        </span>
      </a>
    </li>
  `;
}

export function renderDocsListBody(locale: LocaleCode, basePath: string, _categories: string[], pages: DocPage[], mode: SortMode): string {
  const tr = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) => translate(locale, key, params);
  const localePages = pages.filter((page) => page.locale === locale);
  const pinnedPages = sortPages(localePages.filter((p) => p.pinned), mode, locale);
  const regularPages = sortPages(localePages.filter((p) => !p.pinned), mode, locale);

  const pinnedHtml = pinnedPages.length
    ? `<ul class="doc-list doc-list--pinned">${pinnedPages.map((page) => renderDocItem(page, locale, basePath)).join("")}</ul>`
    : "";
  const regularHtml = regularPages.length
    ? `<ul class="doc-list doc-list--regular">${regularPages.map((page) => renderDocItem(page, locale, basePath)).join("")}</ul>`
    : "";

  return `
    <section class="step">
      <div class="step__head">
        <h1>${tr("page.docs.title")}</h1>
        <div class="sort-menu">
          <details>
            <summary class="sort-menu__trigger" aria-label="${tr("docs.sort.label")}">${SORT_ICON}</summary>
            <div class="sort-menu__popover">
              ${SORT_MODES.map((m) => `<a class="sort-menu__option${m === mode ? " sort-menu__option--active" : ""}" href="#" data-sort="${m}">${tr(`docs.sort.${m}` as any)}</a>`).join("")}
            </div>
          </details>
        </div>
      </div>
      ${pinnedHtml}
      ${regularHtml}
    </section>
  `;
}

export function renderDocsDetailBody(locale: LocaleCode, basePath: string, page: DocPage): string {
  const tr = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) => translate(locale, key, params);
  return `
    <section class="step doc-detail">
      <a class="secondary doc-detail__back" href="${routePath(basePath, [locale, "docs"])}">${tr("docs.backToList")}</a>
      ${page.isFallback ? `<p class="doc-detail__fallback-notice">${tr("docs.fallbackBadge", { locale: sourceLocaleLabel(page) })}</p>` : ""}
      <article class="doc-detail__body">${page.html}</article>
      <div class="doc-meta doc-meta--footer">
        ${authorBadge(page, "lg", locale, true)}
        ${page.createdAt ? `<span>${tr("docs.createdOn", { date: formatDate(locale, page.createdAt) })}</span>` : ""}
        ${page.updatedAt ? `<span>${tr("docs.updatedOn", { date: formatDate(locale, page.updatedAt) })}</span>` : ""}
      </div>
    </section>
  `;
}

export function renderDocsMissingBody(locale: LocaleCode, basePath: string): string {
  const tr = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  return `
    <section class="step">
      <h1 class="sr-only">${tr("page.docs.title")}</h1>
      <p class="muted">${tr("page.docs.placeholder")}</p>
      <a class="secondary" href="${routePath(basePath, [locale, "docs"])}">${tr("docs.backToList")}</a>
    </section>
  `;
}
