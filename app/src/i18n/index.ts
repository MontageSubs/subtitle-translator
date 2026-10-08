import { persistentStorage } from "../utils/safeStorage";
import { LocaleCode, DEFAULT_LOCALE, LOCALES, LOCALE_META, LOCALE_STORAGE_KEY } from "./locales.config";
import { TranslationKey, translate } from "./dictionaries";

export type { LocaleCode } from "./locales.config";
export { DEFAULT_LOCALE, LOCALES, LOCALE_META } from "./locales.config";
export type { TranslationKey } from "./dictionaries";


export function isLocaleCode(value: string): value is LocaleCode {
  return (LOCALES as readonly string[]).includes(value);
}

export function detectPreferredLocale(): LocaleCode {
  const saved = persistentStorage.getItem(LOCALE_STORAGE_KEY);
  if (saved && isLocaleCode(saved)) return saved;
  const browserLang = navigator.language.toLowerCase();
  if (browserLang.startsWith("zh-hant") || browserLang.startsWith("zh-tw") || browserLang.startsWith("zh-hk")) return "zh-Hant";
  if (browserLang.startsWith("zh")) return "zh-Hans";
  return DEFAULT_LOCALE;
}

function applyDocumentDirection(locale: LocaleCode): void {
  document.documentElement.lang = locale;
  document.documentElement.dir = LOCALE_META[locale].direction;
}

let currentLocale: LocaleCode = DEFAULT_LOCALE;
applyDocumentDirection(currentLocale);
const listeners = new Set<(locale: LocaleCode) => void>();

export function getLocale(): LocaleCode {
  return currentLocale;
}

export function setLocale(locale: LocaleCode): void {
  if (locale === currentLocale) return;
  currentLocale = locale;
  applyDocumentDirection(locale);
  listeners.forEach((fn) => fn(locale));
}

export function rememberLocale(locale: LocaleCode): void {
  persistentStorage.setItem(LOCALE_STORAGE_KEY, locale);
}

export function onLocaleChange(fn: (locale: LocaleCode) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function t(key: TranslationKey, params?: Record<string, string | number>): string {
  return translate(currentLocale, key, params);
}
