import type { LocaleCode } from "../i18n/locales.config";

interface LocalizedPage {
  locale: LocaleCode;
  isFallback: boolean;
}

export const translatedLocales = (pages: readonly LocalizedPage[], locales: readonly LocaleCode[]): LocaleCode[] =>
  locales.filter((locale) => pages.some((page) => page.locale === locale && !page.isFallback));
