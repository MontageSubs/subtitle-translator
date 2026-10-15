import { DEFAULT_LOCALE, LocaleCode, orderLocales } from "./locales.config";

export type TranslationKey = keyof typeof import("./locales/en.json");
type LocaleDictionary = Partial<Record<TranslationKey, string>>;
export type TranslationParams = Record<string, string | number>;

const DICTIONARIES = new Map<LocaleCode, LocaleDictionary>(
  Object.entries(import.meta.glob<LocaleDictionary>("./locales/*.json", { eager: true, import: "default" })).map(
    ([path, dictionary]) => [path.slice("./locales/".length, -".json".length), dictionary],
  ),
);

export const LOCALES: readonly LocaleCode[] = orderLocales(DICTIONARIES.keys());

export const isLocaleCode = (value: string): boolean => LOCALES.includes(value);

export function lookupTranslation(locale: LocaleCode, key: string): string | undefined {
  return DICTIONARIES.get(locale)?.[key as TranslationKey] || undefined;
}

export function translate(locale: LocaleCode, key: TranslationKey, params?: TranslationParams): string {
  const text = lookupTranslation(locale, key) ?? lookupTranslation(DEFAULT_LOCALE, key) ?? key;
  return params ? text.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match)) : text;
}
