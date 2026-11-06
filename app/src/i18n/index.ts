import { persistentStorage } from "../utils/safeStorage";
import { STORAGE_KEYS } from "../config/storage";
import { DEFAULT_LOCALE, LocaleCode, localeDirection } from "./locales.config";
import { LOCALES, isLocaleCode } from "./catalog";
import { TranslationKey, TranslationParams, translate } from "./dictionaries";
import { matchPreferredLocale } from "./negotiate";

export type { LocaleCode } from "./locales.config";
export type { TranslationKey } from "./dictionaries";
export { giscusLanguage, turnstileLanguage } from "./locales.config";
export { isLocaleCode } from "./catalog";
export { loadLocale } from "./dictionaries";
export { parseLanguageTag } from "./negotiate";

function browserLanguages(): readonly string[] {
  const { languages, language } = navigator;
  return languages?.length ? languages : [language];
}

export function detectPreferredLocale(): LocaleCode {
  const saved = persistentStorage.getItem(STORAGE_KEYS.locale);
  if (saved && isLocaleCode(saved)) return saved;
  return matchPreferredLocale(browserLanguages(), LOCALES, DEFAULT_LOCALE);
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
  persistentStorage.setItem(STORAGE_KEYS.locale, locale);
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
