import { inferScript, parseLanguageTag } from "./negotiate";

export type LocaleCode = string;
export type TextDirection = "ltr" | "rtl";

export const DEFAULT_LOCALE: LocaleCode = "en";

const RTL_SCRIPTS: ReadonlySet<string> = new Set(["Arab", "Hebr", "Thaa", "Syrc", "Nkoo", "Adlm"]);
const RTL_LANGUAGES: ReadonlySet<string> = new Set(["ar", "fa", "he", "ur", "ps", "sd", "ug", "yi", "ckb", "syr", "dv"]);
const GISCUS_LANGUAGES: Readonly<Record<string, string>> = {
  ar: "ar", be: "be", bg: "bg", bs: "hbs", ca: "ca", cs: "cs", da: "da", de: "de", el: "gr", en: "en", eo: "eo", es: "es", eu: "eu",
  fa: "fa", fr: "fr", he: "he", hr: "hbs", hu: "hu", id: "id", it: "it", ja: "ja", km: "kh", ko: "ko", nl: "nl", pl: "pl", pt: "pt",
  ro: "ro", ru: "ru", sr: "hbs", th: "th", tr: "tr", uk: "uk", uz: "uz", vi: "vi",
};
const GISCUS_TRADITIONAL_CHINESE_REGIONS: Readonly<Record<string, string>> = { HK: "zh-HK", MO: "zh-HK" };

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
  if (tag.language === "zh") {
    return inferScript(tag) === "Hant" ? GISCUS_TRADITIONAL_CHINESE_REGIONS[tag.region ?? ""] ?? "zh-TW" : "zh-CN";
  }
  return GISCUS_LANGUAGES[tag.language] ?? DEFAULT_LOCALE;
}

export function turnstileLanguage(locale: LocaleCode): string {
  const tag = parseLanguageTag(locale);
  if (tag.language === "zh") return inferScript(tag) === "Hant" ? "zh-tw" : "zh-cn";
  return /^[a-z]{2}$/.test(tag.language) ? tag.language : "auto";
}
