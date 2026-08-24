import { StaticPage } from "../../vite-plugins/docsContent";
import { LocaleCode } from "../i18n/locales.config";
import { TranslationKey, translate } from "../i18n/dictionaries";

export function renderStaticPageBody(locale: LocaleCode, page: StaticPage | undefined, placeholderKey: TranslationKey): string {
  if (!page) return `<section class="step"><p class="muted">${translate(locale, placeholderKey)}</p></section>`;
  return `
    <section class="step doc-detail">
      ${page.isFallback ? `<p class="doc-detail__fallback-notice">${translate(locale, "docs.fallbackNotice")}</p>` : ""}
      <article class="doc-detail__body">${page.html}</article>
    </section>
  `;
}
