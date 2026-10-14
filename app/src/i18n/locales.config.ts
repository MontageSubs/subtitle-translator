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

export const LOCALE_META: Record<string, LocaleMeta> = new Proxy(KNOWN_LOCALE_META, {
  get(target, prop: string) {
    return target[prop] ?? resolveLocaleMeta(prop);
  },
});

export const LOCALES: readonly LocaleCode[] = ["en", "zh-Hans", "zh-Hant"];
