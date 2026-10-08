import { zhHans } from "./locales/zh-Hans";
import { zhHant } from "./locales/zh-Hant";
import { en } from "./locales/en";
import { LocaleCode, DEFAULT_LOCALE } from "./locales.config";

export type TranslationKey = keyof typeof zhHans;
const DICTIONARIES: Record<LocaleCode, Record<TranslationKey, string>> = { "zh-Hans": zhHans, "zh-Hant": zhHant, en };

export function translate(locale: LocaleCode, key: TranslationKey, params?: Record<string, string | number>): string {
  let text = DICTIONARIES[locale][key] ?? DICTIONARIES[DEFAULT_LOCALE][key] ?? key;
  if (params) for (const [name, value] of Object.entries(params)) text = text.split(`{${name}}`).join(String(value));
  return text;
}
