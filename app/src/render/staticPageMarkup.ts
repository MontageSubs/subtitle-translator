import { StaticPage } from "../types/docs";
import { LocaleCode } from "../i18n/locales.config";
import { TranslationKey, translate } from "../i18n/dictionaries";
import { languageDisplayName } from "../utils/languageNames";
import { renderDocHeader } from "./docHeader";

export function renderFallbackNotice(locale: LocaleCode, page: StaticPage): string {
  if (!page.isFallback) return "";
  return `<p class="doc-detail__fallback-notice">${translate(locale, "docs.fallbackNotice", { locale: languageDisplayName(page.sourceLocale, locale) })}</p>`;
}

export function renderStaticPageBody(locale: LocaleCode, page: StaticPage | undefined, placeholderKey: TranslationKey): string {
  if (!page) return `<section class="step"><p class="muted">${translate(locale, placeholderKey)}</p></section>`;
  return `
    <section class="step doc-detail">
      ${renderFallbackNotice(locale, page)}
      <article class="doc-detail__body">${renderDocHeader(locale, page)}${page.html}</article>
    </section>
  `;
}
