import { LocaleCode, DEFAULT_LOCALE, LOCALES } from "./locales.config";
import { TranslationKey, TextDirection, LOCALE_DIRECTIONS, translate } from "./dictionaries";

export type { LocaleCode } from "./locales.config";
export { DEFAULT_LOCALE, LOCALES } from "./locales.config";
export type { TranslationKey, TextDirection } from "./dictionaries";

const LOCALE_STORAGE_KEY = "subtitle-translator:locale";

export function isLocaleCode(value: string): value is LocaleCode {
  return (LOCALES as readonly string[]).includes(value);
}

export function detectPreferredLocale(): LocaleCode {
  const saved = localStorage.getItem(LOCALE_STORAGE_KEY);
  if (saved && isLocaleCode(saved)) return saved;
  const browserLang = navigator.language.toLowerCase();
  if (browserLang.startsWith("zh-hant") || browserLang.startsWith("zh-tw") || browserLang.startsWith("zh-hk")) return "zh-Hant";
  if (browserLang.startsWith("zh")) return "zh-Hans";
  return DEFAULT_LOCALE;
}

function applyDocumentDirection(locale: LocaleCode): void {
  document.documentElement.lang = locale;
  document.documentElement.dir = LOCALE_DIRECTIONS[locale];
}

let currentLocale: LocaleCode = DEFAULT_LOCALE;
applyDocumentDirection(currentLocale);
const listeners = new Set<(locale: LocaleCode) => void>();

export function getLocale(): LocaleCode {
  return currentLocale;
}

export function getDirection(): TextDirection {
  return LOCALE_DIRECTIONS[currentLocale];
}

export function setLocale(locale: LocaleCode): void {
  if (locale === currentLocale) return;
  currentLocale = locale;
  localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  applyDocumentDirection(locale);
  listeners.forEach((fn) => fn(locale));
}

export function onLocaleChange(fn: (locale: LocaleCode) => void): void {
  listeners.add(fn);
}

export function t(key: TranslationKey, params?: Record<string, string | number>): string {
  return translate(currentLocale, key, params);
}
