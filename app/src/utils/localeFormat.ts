import { LOCALE_META, LocaleCode } from "../i18n/locales.config";

export function formatDateTime(ms: number, locale: LocaleCode): string {
  return new Intl.DateTimeFormat(LOCALE_META[locale].intl, { dateStyle: "medium", timeStyle: "short" }).format(new Date(ms));
}

export function formatDate(isoOrMs: string | number, locale: LocaleCode): string {
  return isoOrMs ? new Intl.DateTimeFormat(LOCALE_META[locale].intl, { dateStyle: "medium" }).format(new Date(isoOrMs)) : "";
}

export function formatCompactNumber(value: number, locale: LocaleCode): string {
  return new Intl.NumberFormat(LOCALE_META[locale].intl, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}
