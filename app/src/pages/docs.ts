import { docPages, docCategories, DocPage } from "virtual:docs-content";
import { getRoute, buildPath } from "../router";
import { getLocale, LocaleCode, TranslationKey, t } from "../i18n";
import { setPageMeta } from "../head";
import { formatDate } from "../core/formatDate";
import { LOCALE_LABELS } from "../localeLabels";
import { GISCUS_REPO } from "../config";

type SortMode = "newest" | "oldest" | "az" | "za";
const SORT_MODES: SortMode[] = ["newest", "oldest", "az", "za"];
const SORT_LABEL_KEYS: Record<SortMode, TranslationKey> = {
  newest: "docs.sort.newest",
  oldest: "docs.sort.oldest",
  az: "docs.sort.az",
  za: "docs.sort.za",
};

const PIN_ICON = `<svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M10 2c-2.2 0-4 1.8-4 4 0 2.8 4 8 4 8s4-5.2 4-8c0-2.2-1.8-4-4-4z" />
  <circle cx="10" cy="6" r="1.3" />
</svg>`;

function sourceLocaleLabel(page: DocPage): string {
  return LOCALE_LABELS[page.sourceLocale as LocaleCode] ?? page.sourceLocale;
}

function sortPages(pages: DocPage[], mode: SortMode): DocPage[] {
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

function authorBadge(page: DocPage, size: "sm" | "lg"): string {
  if (!page.authors.length) return "";
  const contributorsUrl = GISCUS_REPO ? `https://github.com/${GISCUS_REPO}/graphs/contributors` : "";
  const avatars = page.authors
    .slice()
    .reverse()
    .map(
      (author, index) => `
        <span class="avatar-stack__item" style="z-index:${index}">
          <img src="${author.avatarUrl}" alt="" />
          <span class="avatar-stack__name">${author.login}</span>
        </span>
      `
    )
    .join("");
  const stack = `<span class="avatar-stack avatar-stack--${size}">${avatars}</span>`;
  return contributorsUrl
    ? `<a href="${contributorsUrl}" target="_blank" rel="noopener" aria-label="${t("docs.contributors")}">${stack}</a>`
    : stack;
}

function renderList(container: HTMLElement): void {
  const locale = getLocale();
  let mode: SortMode = "newest";

  function draw(): void {
    const pagesByCategory = docCategories.map((category) => ({
      category,
      pages: sortPages(docPages.filter((page) => page.category === category && page.locale === locale), mode),
    }));

    container.innerHTML = `
      <section class="step">
        <div class="step__head">
          <h2>${t("page.docs.title")}</h2>
          <div class="sort-menu" id="sort-menu">
            <button type="button" class="sort-menu__trigger" id="sort-menu-trigger" aria-haspopup="true" aria-expanded="false" aria-label="${t("docs.sort.label")}">↕</button>
            <div class="sort-menu__popover" id="sort-menu-popover" hidden>
              ${SORT_MODES.map((m) => `<button type="button" class="sort-menu__option${m === mode ? " sort-menu__option--active" : ""}" data-sort="${m}">${t(SORT_LABEL_KEYS[m])}</button>`).join("")}
            </div>
          </div>
        </div>
        ${pagesByCategory
          .map(
            (group) => `
              <ul class="doc-list">
                ${group.pages
                  .map(
                    (page) => `
                      <li>
                        <a class="doc-list__item" href="${buildPath(locale, "docs", [page.slug])}">
                          <div class="doc-list__main">
                            <span class="doc-list__title">${page.pinned ? `<span class="doc-list__pin" title="${t("docs.pinnedLabel")}">${PIN_ICON}</span>` : ""}${page.title}</span>
                            ${page.isFallback ? `<span class="doc-list__badge">${t("docs.fallbackBadge", { locale: sourceLocaleLabel(page) })}</span>` : ""}
                          </div>
                          <div class="doc-meta">
                            ${authorBadge(page, "sm")}
                            ${page.updatedAt ? `<span>${t("docs.updatedOn", { date: formatDate(page.updatedAt) })}</span>` : ""}
                          </div>
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

    const menu = container.querySelector<HTMLElement>("#sort-menu")!;
    const trigger = container.querySelector<HTMLButtonElement>("#sort-menu-trigger")!;
    const popover = container.querySelector<HTMLElement>("#sort-menu-popover")!;
    trigger.addEventListener("click", () => {
      const willOpen = popover.hidden;
      popover.hidden = !willOpen;
      trigger.setAttribute("aria-expanded", String(willOpen));
    });
    document.addEventListener("click", (e) => { if (!menu.contains(e.target as Node)) popover.hidden = true; });
    popover.querySelectorAll<HTMLButtonElement>("[data-sort]").forEach((btn) => {
      btn.addEventListener("click", () => { mode = btn.dataset.sort as SortMode; draw(); });
    });
  }

  draw();
}

function renderDetail(container: HTMLElement, slug: string): void {
  const locale = getLocale();
  const page = docPages.find((p) => p.slug === slug && p.locale === locale);

  if (!page) {
    container.innerHTML = `
      <section class="step">
        <p class="muted">${t("page.docs.placeholder")}</p>
        <a class="secondary" href="${buildPath(locale, "docs")}">${t("docs.backToList")}</a>
      </section>
    `;
    return;
  }

  container.innerHTML = `
    <section class="step doc-detail">
      <a class="secondary doc-detail__back" href="${buildPath(locale, "docs")}">${t("docs.backToList")}</a>
      ${page.isFallback ? `<p class="doc-detail__fallback-notice">${t("docs.fallbackBadge", { locale: sourceLocaleLabel(page) })}</p>` : ""}
      <article class="doc-detail__body">${page.html}</article>
      <div class="doc-meta doc-meta--footer">
        ${authorBadge(page, "lg")}
        ${page.createdAt ? `<span>${t("docs.createdOn", { date: formatDate(page.createdAt) })}</span>` : ""}
        ${page.updatedAt ? `<span>${t("docs.updatedOn", { date: formatDate(page.updatedAt) })}</span>` : ""}
      </div>
    </section>
  `;
  setPageMeta(page.title, t("meta.docs.description"));
}

export function mount(container: HTMLElement, _signal: AbortSignal): void {
  const route = getRoute();
  const slug = route.rest[0];
  if (slug) renderDetail(container, slug);
  else renderList(container);
}
