import { inferScript, parseLanguageTag } from "./negotiate";

export type LocaleCode = string;
export type TextDirection = "ltr" | "rtl";

export const DEFAULT_LOCALE: LocaleCode = "en";
export const LOCALE_STORAGE_KEY = "subtitle-translator:locale";

const RTL_SCRIPTS: ReadonlySet<string> = new Set(["Arab", "Hebr", "Thaa", "Syrc", "Nkoo", "Adlm"]);
const RTL_LANGUAGES: ReadonlySet<string> = new Set(["ar", "fa", "he", "ur", "ps", "sd", "ug", "yi", "ckb", "syr", "dv"]);
const GISCUS_LANGUAGES: ReadonlySet<string> = new Set([
  "ar", "be", "bg", "ca", "cs", "da", "de", "en", "eo", "es", "eu", "fa", "fr", "gr", "hbs", "he", "hu", "id", "it", "ja", "kh", "ko", "nl", "pl", "pt", "ro", "ru", "th", "tr", "uk", "uz", "vi", "zh-CN", "zh-HK", "zh-TW",
]);

export function isWellFormedLocale(code: string): boolean {
  try {
    return Intl.getCanonicalLocales(code)[0] === code;
  } catch {
    return false;
  }
}

export function orderLocales(codes: Iterable<string>): LocaleCode[] {
  const others = [...codes].filter((code) => code !== DEFAULT_LOCALE && isWellFormedLocale(code)).sort();
  return [DEFAULT_LOCALE, ...others];
}

export function localeDirection(locale: LocaleCode): TextDirection {
  const tag = parseLanguageTag(locale);
  const script = inferScript(tag);
  return (script ? RTL_SCRIPTS.has(script) : RTL_LANGUAGES.has(tag.language)) ? "rtl" : "ltr";
}

export function giscusLanguage(locale: LocaleCode): string {
  const tag = parseLanguageTag(locale);
  if (tag.language === "zh") return inferScript(tag) === "Hant" ? "zh-TW" : "zh-CN";
  return GISCUS_LANGUAGES.has(tag.language) ? tag.language : DEFAULT_LOCALE;
}
