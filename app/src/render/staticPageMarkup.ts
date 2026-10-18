import { StaticPage } from "../types/docs";
import { LocaleCode } from "../i18n/locales.config";
import { TranslationKey, translate } from "../i18n/dictionaries";
import { renderDocDetail } from "./docDetail";

export function renderStaticPageBody(locale: LocaleCode, page: StaticPage | undefined, placeholderKey: TranslationKey): string {
  if (!page) return `<section class="step"><p class="muted">${translate(locale, placeholderKey)}</p></section>`;
  return renderDocDetail(locale, page);
}
