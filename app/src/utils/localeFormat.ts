import type { LocaleCode } from "../i18n/locales.config";

export function formatDateTime(ms: number, locale: LocaleCode): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(ms));
}

export function formatDate(isoOrMs: string | number, locale: LocaleCode): string {
  return isoOrMs ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(isoOrMs)) : "";
}

const DAY_MS = 86_400_000;
const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [["year", 365 * DAY_MS], ["month", 30 * DAY_MS], ["day", DAY_MS]];

export function formatRelativeDate(value: string | number, locale: LocaleCode, now = Date.now()): string {
  const elapsed = new Date(value).getTime() - now;
  const [unit, size] = RELATIVE_UNITS.find(([, span]) => Math.abs(elapsed) >= span) ?? RELATIVE_UNITS[RELATIVE_UNITS.length - 1];
  return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(Math.trunc(elapsed / size), unit);
}

export function applyRelativeDates(root: ParentNode, locale: LocaleCode): void {
  root.querySelectorAll<HTMLTimeElement>("time[data-relative]").forEach((element) => {
    element.textContent = formatRelativeDate(element.dateTime, locale);
  });
}

export function formatCompactNumber(value: number, locale: LocaleCode): string {
  return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}
