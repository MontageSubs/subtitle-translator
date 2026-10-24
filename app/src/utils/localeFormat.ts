import type { LocaleCode } from "../i18n/locales.config";

export function formatDateTime(ms: number, locale: LocaleCode): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(ms));
}

export function formatDate(isoOrMs: string | number, locale: LocaleCode): string {
  return isoOrMs ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(isoOrMs)) : "";
}

const DAY_MS = 86_400_000;
const MONTH_MS = 30 * DAY_MS;
const ABSOLUTE_DATE_AFTER_MS = 12 * MONTH_MS;
const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [["month", MONTH_MS], ["day", DAY_MS]];

function separateNumeralFromHan(text: string, locale: LocaleCode): string {
  return locale.startsWith("zh") ? text.replace(/(\d)(?=\p{Script=Han})/gu, "$1 ") : text;
}

export function formatRelativeDate(value: string | number, locale: LocaleCode, now = Date.now()): string {
  const elapsed = new Date(value).getTime() - now;
  if (Math.abs(elapsed) >= ABSOLUTE_DATE_AFTER_MS) return formatDate(value, locale);
  const [unit, size] = RELATIVE_UNITS.find(([, span]) => Math.abs(elapsed) >= span) ?? RELATIVE_UNITS[RELATIVE_UNITS.length - 1];
  return separateNumeralFromHan(new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(Math.trunc(elapsed / size), unit), locale);
}

export function applyRelativeDates(root: ParentNode, locale: LocaleCode): void {
  root.querySelectorAll<HTMLTimeElement>("time[data-relative]").forEach((element) => {
    element.textContent = formatRelativeDate(element.dateTime, locale);
  });
}

export function formatCompactNumber(value: number, locale: LocaleCode): string {
  return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}
