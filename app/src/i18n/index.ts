import { DEFAULT_LOCALE, LocaleCode, localeDirection } from "./locales.config";
import { MarkupParams, TranslationKey, TranslationParams, translate, translateHtml } from "./dictionaries";
import { preferredLocale } from "./localePreference";

export type { LocaleCode } from "./locales.config";
export type { TranslationKey } from "./dictionaries";
export { giscusLanguage, turnstileLanguage } from "./locales.config";
export { isLocaleCode } from "./catalog";
export { loadLocale } from "./dictionaries";
export { rememberLocale } from "./localePreference";
export { Markup, markup } from "./markup";
export { parseLanguageTag } from "./negotiate";

export function detectPreferredLocale(): LocaleCode {
  return preferredLocale() || DEFAULT_LOCALE;
}

let currentLocale: LocaleCode = DEFAULT_LOCALE;
const listeners = new Set<(locale: LocaleCode) => void>();

export function getLocale(): LocaleCode {
  return currentLocale;
}

export function setLocale(locale: LocaleCode): void {
  if (locale === currentLocale) return;
  currentLocale = locale;
  document.documentElement.lang = locale;
  document.documentElement.dir = localeDirection(locale);
  listeners.forEach((listener) => listener(locale));
}

export function onLocaleChange(listener: (locale: LocaleCode) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function t(key: TranslationKey, params?: TranslationParams): string {
  return translate(currentLocale, key, params);
}

export function th(key: TranslationKey, params?: MarkupParams): string {
  return translateHtml(currentLocale, key, params);
}
