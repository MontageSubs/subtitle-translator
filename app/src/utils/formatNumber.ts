import type { LocaleCode } from "../i18n/locales.config";

const INTL_LOCALE: Record<LocaleCode, string> = { en: "en-US", "zh-Hans": "zh-CN", "zh-Hant": "zh-TW" };

export function formatCompactNumber(value: number, locale: LocaleCode): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale] || "en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}
