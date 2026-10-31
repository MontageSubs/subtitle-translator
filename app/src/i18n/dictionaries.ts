import en from "./locales/en.json";
import localePacks from "virtual:locale-packs";
import { DEFAULT_LOCALE, LocaleCode } from "./locales.config";
import { StripPluralSuffix, pluralKey, selectPluralCategory } from "./plural";

export type TranslationKey = StripPluralSuffix<keyof typeof en>;
export type TranslationParams = Record<string, string | number>;
export type LocaleDictionary = Readonly<Record<string, string>>;

const LOCALE_FILE_SUFFIX = ".json";
const PLURAL_COUNT_PARAM = "count";

const dictionaries = new Map<LocaleCode, LocaleDictionary>([[DEFAULT_LOCALE, en]]);
const pendingLoads = new Map<LocaleCode, Promise<void>>();

export const localeOfDictionaryPath = (path: string): LocaleCode => path.slice(path.lastIndexOf("/") + 1, -LOCALE_FILE_SUFFIX.length);

export function storeDictionary(locale: LocaleCode, dictionary: LocaleDictionary): void {
  dictionaries.set(locale, dictionary);
}

async function fetchDictionary(url: string): Promise<LocaleDictionary | undefined> {
  const response = await fetch(url);
  if (!response.ok) return undefined;
  const dictionary: unknown = await response.json();
  return dictionary && typeof dictionary === "object" ? (dictionary as LocaleDictionary) : undefined;
}

export function loadLocale(locale: LocaleCode): Promise<void> {
  const url = localePacks[locale];
  if (dictionaries.has(locale) || !url) return Promise.resolve();
  let pending = pendingLoads.get(locale);
  if (!pending) {
    pending = fetchDictionary(url)
      .then((dictionary) => {
        if (dictionary) storeDictionary(locale, dictionary);
      })
      .catch(() => undefined)
      .finally(() => pendingLoads.delete(locale));
    pendingLoads.set(locale, pending);
  }
  return pending;
}

export function lookupTranslation(locale: LocaleCode, key: string): string | undefined {
  return dictionaries.get(locale)?.[key] || undefined;
}

function lookupPlural(locale: LocaleCode, key: string, count: number): string | undefined {
  return lookupTranslation(locale, pluralKey(key, selectPluralCategory(locale, count))) ?? lookupTranslation(locale, pluralKey(key, "other"));
}

function resolveText(locale: LocaleCode, key: string, count: number | undefined): string | undefined {
  return (count === undefined ? undefined : lookupPlural(locale, key, count)) ?? lookupTranslation(locale, key);
}

export function translate(locale: LocaleCode, key: TranslationKey, params?: TranslationParams): string {
  const countParam = params?.[PLURAL_COUNT_PARAM];
  const count = typeof countParam === "number" ? countParam : undefined;
  const text = resolveText(locale, key, count) ?? resolveText(DEFAULT_LOCALE, key, count) ?? key;
  return params ? text.replace(/\{(\w+)\}/g, (placeholder, name: string) => (name in params ? String(params[name]) : placeholder)) : text;
}
