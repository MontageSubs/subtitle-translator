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

const RTL_LANGUAGES = new Set(["ar", "fa", "he", "ur", "ps", "sd", "ug", "yi"]);

const KNOWN_LOCALE_META: Record<string, LocaleMeta> = {
  en: { intl: "en-US", giscus: "en", direction: "ltr" },
  "zh-Hans": { intl: "zh-CN", giscus: "zh-CN", direction: "ltr" },
  "zh-Hant": { intl: "zh-TW", giscus: "zh-TW", direction: "ltr" },
};

const SUPPORTED_LOCALES: LocaleCode[] = ["en", "zh-Hans", "zh-Hant"];

export function resolveLocaleMeta(locale: string): LocaleMeta {
  const existing = KNOWN_LOCALE_META[locale];
  if (existing) return existing;
  const primary = locale.split("-")[0].toLowerCase();
  return {
    intl: locale,
    giscus: locale,
    direction: RTL_LANGUAGES.has(primary) ? "rtl" : "ltr",
  };
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
