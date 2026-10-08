export type LocaleCode = "en" | "zh-Hans" | "zh-Hant";
export type TextDirection = "ltr" | "rtl";

export interface LocaleMeta {
  label: string;
  intl: string;
  giscus: string;
  direction: TextDirection;
}

export const DEFAULT_LOCALE: LocaleCode = "en";
export const LOCALE_STORAGE_KEY = "subtitle-translator:locale";

export const LOCALE_META: Record<LocaleCode, LocaleMeta> = {
  en: { label: "English", intl: "en-US", giscus: "en", direction: "ltr" },
  "zh-Hans": { label: "简体中文", intl: "zh-CN", giscus: "zh-CN", direction: "ltr" },
  "zh-Hant": { label: "繁體中文", intl: "zh-TW", giscus: "zh-TW", direction: "ltr" },
};

export const LOCALES = Object.keys(LOCALE_META) as readonly LocaleCode[];
