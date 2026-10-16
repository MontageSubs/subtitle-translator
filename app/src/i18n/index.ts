import { persistentStorage } from "../utils/safeStorage";
import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY, LocaleCode, localeDirection } from "./locales.config";
import { LOCALES, isLocaleCode } from "./catalog";
import { TranslationKey, TranslationParams, loadLocale, translate } from "./dictionaries";
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
  const saved = persistentStorage.getItem(LOCALE_STORAGE_KEY);
  if (saved && isLocaleCode(saved)) return saved;
  return matchPreferredLocale(browserLanguages(), LOCALES, DEFAULT_LOCALE);
}

function candidateLocales(): LocaleCode[] {
  const saved = persistentStorage.getItem(LOCALE_STORAGE_KEY);
  const matched = browserLanguages().map((language) => matchPreferredLocale([language], LOCALES, ""));
  return [...new Set([saved ?? "", ...matched, DEFAULT_LOCALE])].filter(isLocaleCode);
}

export function preloadCandidateLocales(): void {
  const preload = () => candidateLocales().forEach(loadLocale);
  if ("requestIdleCallback" in window) window.requestIdleCallback(preload);
  else setTimeout(preload, 1);
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
