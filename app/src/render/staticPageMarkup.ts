import { StaticPage } from "../types/docs";
import { LocaleCode } from "../i18n/locales.config";
import { TranslationKey, translateHtml } from "../i18n/dictionaries";
import { renderDocDetail } from "./docDetail";

export function renderStaticPageBody(locale: LocaleCode, page: StaticPage | undefined, placeholderKey: TranslationKey, backLink = ""): string {
  if (!page) return `<section class="step"><p class="muted">${translateHtml(locale, placeholderKey)}</p></section>`;
  return renderDocDetail(locale, page, { backLink });
}
