export type KnownLocaleCode = "en" | "zh-Hans" | "zh-Hant";
export type LocaleCode = KnownLocaleCode | (string & {});
export type TextDirection = "ltr" | "rtl";

export interface LocaleMeta {
  intl: string;
  giscus: string;
  direction: TextDirection;
}

export const DEFAULT_LOCALE: LocaleCode = "en";
export const LOCALE_STORAGE_KEY = "subtitle-translator:locale";

const RTL_LANGUAGES = new Set([
  "ar", "fa", "he", "ur", "ps", "sd", "ug", "yi", "ckb", "syr", "dv"
]);

const REGIONAL_INTL_MAP: Record<string, string> = {
  en: "en-US",
  "zh-Hans": "zh-CN",
  "zh-Hant": "zh-TW",
  ja: "ja-JP",
  ko: "ko-KR",
  es: "es-ES",
  pt: "pt-PT",
  "pt-br": "pt-BR",
  fr: "fr-FR",
  de: "de-DE",
  it: "it-IT",
  ru: "ru-RU",
  uk: "uk-UA",
  pl: "pl-PL",
  tr: "tr-TR",
  vi: "vi-VN",
  th: "th-TH",
  id: "id-ID",
  ar: "ar-SA",
  hi: "hi-IN",
  nl: "nl-NL",
  sv: "sv-SE",
  no: "nb-NO",
  da: "da-DK",
  fi: "fi-FI",
  cs: "cs-CZ",
  el: "el-GR",
  ro: "ro-RO",
  hu: "hu-HU",
};

const GISCUS_MAP: Record<string, string> = {
  "zh-Hans": "zh-CN",
  "zh-Hant": "zh-TW",
  en: "en",
  ja: "ja",
  ko: "ko",
  es: "es",
  fr: "fr",
  de: "de",
  it: "it",
  pt: "pt",
  "pt-br": "pt",
  ru: "ru",
  tr: "tr",
  pl: "pl",
  id: "id",
  vi: "vi",
  th: "th",
  ar: "ar",
};

const KNOWN_LOCALE_META: Record<string, LocaleMeta> = {
  en: { intl: "en-US", giscus: "en", direction: "ltr" },
  "zh-Hans": { intl: "zh-CN", giscus: "zh-CN", direction: "ltr" },
  "zh-Hant": { intl: "zh-TW", giscus: "zh-TW", direction: "ltr" },
};

const SUPPORTED_LOCALES: LocaleCode[] = ["en", "zh-Hans", "zh-Hant"];

export function resolveLocaleMeta(locale: string): LocaleMeta {
  const existing = KNOWN_LOCALE_META[locale];
  if (existing) return existing;
  const lower = locale.toLowerCase();
  const primary = lower.split("-")[0];
  const intl = REGIONAL_INTL_MAP[lower] ?? REGIONAL_INTL_MAP[primary] ?? locale;
  const giscus = GISCUS_MAP[lower] ?? GISCUS_MAP[primary] ?? (primary in GISCUS_MAP ? GISCUS_MAP[primary] : "en");
  const direction: TextDirection = RTL_LANGUAGES.has(primary) ? "rtl" : "ltr";
  return { intl, giscus, direction };
}

export function registerLocale(locale: string, meta?: Partial<LocaleMeta>): LocaleMeta {
  if (!SUPPORTED_LOCALES.includes(locale)) {
    SUPPORTED_LOCALES.push(locale);
  }
  const resolved = { ...resolveLocaleMeta(locale), ...meta };
  KNOWN_LOCALE_META[locale] = resolved;
  return resolved;
}

export const LOCALE_META: Record<string, LocaleMeta> = new Proxy(KNOWN_LOCALE_META, {
  get(target, prop: string) {
    return target[prop] ?? resolveLocaleMeta(prop);
  },
  has(target, prop: string) {
    return prop in target || SUPPORTED_LOCALES.includes(prop);
  },
  ownKeys() {
    return Array.from(new Set([...Object.keys(KNOWN_LOCALE_META), ...SUPPORTED_LOCALES]));
  },
  getOwnPropertyDescriptor(target, prop: string) {
    const value = target[prop] ?? resolveLocaleMeta(prop);
    return {
      value,
      writable: true,
      enumerable: true,
      configurable: true,
    };
  },
  set(target, prop: string, value: LocaleMeta) {
    target[prop] = value;
    if (!SUPPORTED_LOCALES.includes(prop)) {
      SUPPORTED_LOCALES.push(prop);
    }
    return true;
  },
});

export const LOCALES: readonly LocaleCode[] = SUPPORTED_LOCALES;

export function isLocaleCode(value: string): value is LocaleCode {
  return SUPPORTED_LOCALES.includes(value);
}
