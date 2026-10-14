import { persistentStorage } from "../utils/safeStorage";
import {
  LocaleCode,
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_META,
  LOCALE_STORAGE_KEY,
  isLocaleCode,
} from "./locales.config";
import { TranslationKey, translate } from "./dictionaries";
import { matchPreferredLocale, resolveLanguageAssociation, parseLanguageTag } from "./negotiate";

export type { LocaleCode, LocaleMeta, TextDirection, KnownLocaleCode } from "./locales.config";
export {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_META,
  isLocaleCode,
  registerLocale,
  resolveLocaleMeta,
} from "./locales.config";
export type { TranslationKey, KnownTranslationKey, LocaleDictionary } from "./dictionaries";
export { translate, registerDictionary, getDictionary } from "./dictionaries";
export { matchPreferredLocale, resolveLanguageAssociation, parseLanguageTag };

export function detectPreferredLocale(): LocaleCode {
  const saved = persistentStorage.getItem(LOCALE_STORAGE_KEY);
  if (saved && isLocaleCode(saved)) return saved;
  const preferences = typeof navigator !== "undefined" && navigator.languages && navigator.languages.length > 0
    ? navigator.languages
    : [typeof navigator !== "undefined" ? navigator.language : ""];
  return matchPreferredLocale(preferences, LOCALES, DEFAULT_LOCALE);
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
