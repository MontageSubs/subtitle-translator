import { staticPages } from "virtual:docs-content";
import { getLocale, t } from "../i18n";

export function mount(container: HTMLElement, _signal: AbortSignal): void {
  const page = staticPages.about.find((p) => p.locale === getLocale());
  if (!page) {
    container.innerHTML = `<section class="step"><p class="muted">${t("page.about.placeholder")}</p></section>`;
    return;
  }
  container.innerHTML = `
    <section class="step doc-detail">
      ${page.isFallback ? `<p class="doc-detail__fallback-notice">${t("docs.fallbackNotice")}</p>` : ""}
      <article class="doc-detail__body">${page.html}</article>
    </section>
  `;
}
