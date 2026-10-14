import en from "./locales/en.json";
import zhHans from "./locales/zh-Hans.json";
import zhHant from "./locales/zh-Hant.json";
import { LocaleCode, DEFAULT_LOCALE } from "./locales.config";

export type TranslationKey = keyof typeof en;
export type LocaleDictionary = Partial<Record<TranslationKey, string>>;

const DICTIONARIES: Record<string, LocaleDictionary> = {
  en,
  "zh-Hans": zhHans,
  "zh-Hant": zhHant,
};

export function registerDictionary(locale: string, dict: LocaleDictionary): void {
  DICTIONARIES[locale] = dict;
}

export function translate(locale: LocaleCode, key: TranslationKey, params?: Record<string, string | number>): string {
  let text = DICTIONARIES[locale]?.[key] ?? DICTIONARIES[DEFAULT_LOCALE]?.[key] ?? key;
  if (params) for (const [name, value] of Object.entries(params)) text = text.split(`{${name}}`).join(String(value));
  return text;
}
