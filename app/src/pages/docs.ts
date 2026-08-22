import { docPages, docCategories } from "virtual:docs-content";
import { getRoute, buildPath } from "../router";
import { getLocale, t } from "../i18n";

function renderList(container: HTMLElement): void {
  const route = getRoute();
  const locale = getLocale();
  const pagesByCategory = docCategories.map((category) => ({
    category,
    pages: docPages.filter((page) => page.category === category && page.locale === locale),
  }));

  container.innerHTML = `
    <section class="step">
      <h2>${t("page.docs.title")}</h2>
      ${pagesByCategory
        .map(
          (group) => `
            <div class="doc-category">
              <ul class="doc-list">
                ${group.pages
                  .map(
                    (page) => `
                      <li>
                        <a class="doc-list__item" href="${buildPath(locale, "docs", [page.slug])}">
                          <span class="doc-list__title">${page.title}</span>
                          ${page.isFallback ? `<span class="doc-list__badge">${route.locale}</span>` : ""}
                        </a>
                      </li>
                    `
                  )
                  .join("")}
              </ul>
            </div>
          `
        )
        .join("")}
    </section>
  `;
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
      ${page.isFallback ? `<p class="doc-detail__fallback-notice">${t("docs.fallbackNotice")}</p>` : ""}
      <article class="doc-detail__body">${page.html}</article>
    </section>
  `;
}

export function mount(container: HTMLElement): void {
  const route = getRoute();
  const slug = route.rest[0];
  if (slug) renderDetail(container, slug);
  else renderList(container);
}
