import { persistentStorage } from "../utils/safeStorage";
import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY, LocaleCode, localeDirection } from "./locales.config";
import { LOCALES, TranslationKey, TranslationParams, isLocaleCode, translate } from "./dictionaries";
import { matchPreferredLocale } from "./negotiate";

export type { LocaleCode } from "./locales.config";
export type { TranslationKey } from "./dictionaries";
export { giscusLanguage } from "./locales.config";
export { isLocaleCode } from "./dictionaries";
export { parseLanguageTag } from "./negotiate";

export function detectPreferredLocale(): LocaleCode {
  const saved = persistentStorage.getItem(LOCALE_STORAGE_KEY);
  if (saved && isLocaleCode(saved)) return saved;
  const { languages, language } = navigator;
  return matchPreferredLocale(languages?.length ? languages : [language], LOCALES, DEFAULT_LOCALE);
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

export function rememberLocale(locale: LocaleCode): void {
  persistentStorage.setItem(LOCALE_STORAGE_KEY, locale);
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
