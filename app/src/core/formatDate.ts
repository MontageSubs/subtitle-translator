import { getLocale } from "../i18n";

const INTL_LOCALES: Record<string, string> = { "zh-Hans": "zh-CN", "zh-Hant": "zh-TW", en: "en-US" };

export function formatDateTime(ms: number): string {
  return new Intl.DateTimeFormat(INTL_LOCALES[getLocale()], { dateStyle: "medium", timeStyle: "short" }).format(new Date(ms));
}

export function formatDate(isoOrMs: string | number): string {
  if (!isoOrMs) return "";
  return new Intl.DateTimeFormat(INTL_LOCALES[getLocale()], { dateStyle: "medium" }).format(new Date(isoOrMs));
}
