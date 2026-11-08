import type { LocaleCode } from "../i18n/locales.config";

type ElapsedUnit = "hour" | "minute" | "second";

const UNIT_PATTERN_OVERRIDES: Readonly<Partial<Record<LocaleCode, Readonly<Partial<Record<ElapsedUnit, string>>>>>> = {};

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
const MILLISECONDS_PER_TENTH = 100;
const TENTHS_PER_SECOND = 10;

const formatters = new Map<string, Intl.NumberFormat>();

function formatUnit(value: number, unit: ElapsedUnit, locale: LocaleCode, fractionDigits: number): string {
  const override = UNIT_PATTERN_OVERRIDES[locale]?.[unit];
  const key = `${locale}|${unit}|${fractionDigits}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, override
      ? { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits }
      : { style: "unit", unit, unitDisplay: "narrow", minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits });
    formatters.set(key, formatter);
  }
  const formatted = formatter.format(value);
  return override ? override.replace("{value}", formatted) : formatted;
}

export function formatElapsed(milliseconds: number, locale: LocaleCode): string {
  if (milliseconds < SECONDS_PER_MINUTE * 1000) {
    const tenths = Math.floor(milliseconds / MILLISECONDS_PER_TENTH);
    return formatUnit(tenths / TENTHS_PER_SECOND, "second", locale, 1);
  }
  const wholeSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(wholeSeconds / SECONDS_PER_HOUR);
  const minutes = Math.floor((wholeSeconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  const seconds = wholeSeconds % SECONDS_PER_MINUTE;
  return [
    ...(hours ? [formatUnit(hours, "hour", locale, 0)] : []),
    ...(hours || minutes ? [formatUnit(minutes, "minute", locale, 0)] : []),
    formatUnit(seconds, "second", locale, 0),
  ].join(" ");
}
