import { DocPage } from "../../vite-plugins/docsContent";
import { LocaleCode } from "../i18n/locales.config";
import { translate } from "../i18n/dictionaries";
import { LOCALE_LABELS } from "../localeLabels";
import { PIN_ICON } from "./icons";
import { routePath } from "./paths";
import { REPO_URL } from "../social";

export type SortMode = "newest" | "oldest" | "az" | "za";
export const SORT_MODES: SortMode[] = ["newest", "oldest", "az", "za"];

function sourceLocaleLabel(page: DocPage): string {
  return LOCALE_LABELS[page.sourceLocale as LocaleCode] ?? page.sourceLocale;
}

export function sortPages(pages: DocPage[], mode: SortMode): DocPage[] {
  const pinned = pages.filter((p) => p.pinned);
  const rest = pages.filter((p) => !p.pinned);
  const compare: Record<SortMode, (a: DocPage, b: DocPage) => number> = {
    newest: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
    oldest: (a, b) => a.updatedAt.localeCompare(b.updatedAt),
    az: (a, b) => a.title.localeCompare(b.title),
    za: (a, b) => b.title.localeCompare(a.title),
  };
  return [...pinned.sort(compare[mode]), ...rest.sort(compare[mode])];
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

export function renderDocsListBody(locale: LocaleCode, basePath: string, categories: string[], pages: DocPage[], mode: SortMode): string {
  const tr = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) => translate(locale, key, params);
  const groups = categories.map((category) => ({
    category,
    pages: sortPages(pages.filter((page) => page.category === category && page.locale === locale), mode),
  }));

  return `
    <section class="step">
      <div class="step__head">
        <h1>${tr("page.docs.title")}</h1>
        <div class="sort-menu">
          <details>
            <summary class="sort-menu__trigger" aria-label="${tr("docs.sort.label")}">↕</summary>
            <div class="sort-menu__popover">
              ${SORT_MODES.map((m) => `<a class="sort-menu__option${m === mode ? " sort-menu__option--active" : ""}" href="#" data-sort="${m}">${tr(`docs.sort.${m}` as any)}</a>`).join("")}
            </div>
          </details>
        </div>
      </div>
      ${groups
        .map(
          (group) => `
            <ul class="doc-list">
              ${group.pages
                .map(
                  (page) => `
                    <li>
                      <a class="doc-list__item" href="${routePath(basePath, [locale, "docs", page.slug])}">
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
                  `
                )
                .join("")}
            </ul>
          `
        )
        .join("")}
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
