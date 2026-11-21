import type { LocaleCode } from "../i18n/locales.config";
import { formatNumber } from "./numberFormat";

type ElapsedUnit = "hour" | "minute" | "second";

const UNIT_PATTERN_OVERRIDES: Readonly<Partial<Record<LocaleCode, Readonly<Partial<Record<ElapsedUnit, string>>>>>> = {
  ja: { hour: "{value}時間", minute: "{value}分", second: "{value}秒" },
  fa: { hour: "{value} ساعت", minute: "{value} دقیقه", second: "{value} ثانیه" },
  fr: { hour: "{value}\u00a0h", minute: "{value}\u00a0min", second: "{value}\u00a0s" },
  it: { hour: "{value}\u00a0h", minute: "{value}\u00a0min", second: "{value}\u00a0s" },
  ha: { hour: "{value}\u00a0awa", minute: "{value}\u00a0mnt", second: "{value}\u00a0daƙ" },
  sw: { hour: "{value}\u00a0saa", minute: "{value}\u00a0dak", second: "{value}\u00a0sek" },
  tr: { hour: "{value}\u00a0sa", minute: "{value}\u00a0dk", second: "{value}\u00a0sn" },
};

const UNIT_DISPLAY_OVERRIDES: Readonly<Partial<Record<LocaleCode, Intl.NumberFormatOptions["unitDisplay"]>>> = { hi: "long", id: "long" };

const UNIT_SEPARATOR_OVERRIDES: Readonly<Partial<Record<LocaleCode, string>>> = { ja: "" };
const DEFAULT_UNIT_SEPARATOR = " ";

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
const MILLISECONDS_PER_TENTH = 100;
const TENTHS_PER_SECOND = 10;

const formatters = new Map<string, Intl.NumberFormat>();
const countdownSecondFormatters = new Map<string, Intl.NumberFormat>();

function formatUnit(value: number, unit: ElapsedUnit, locale: LocaleCode, fractionDigits: number): string {
  const override = UNIT_PATTERN_OVERRIDES[locale]?.[unit];
  const key = `${locale}|${unit}|${fractionDigits}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, override
      ? { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits }
      : { style: "unit", unit, unitDisplay: UNIT_DISPLAY_OVERRIDES[locale] ?? "narrow", minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits });
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
  ].join(UNIT_SEPARATOR_OVERRIDES[locale] ?? DEFAULT_UNIT_SEPARATOR);
}

export function formatCountdown(milliseconds: number, locale: LocaleCode): string {
  const wholeSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  let secondsFormatter = countdownSecondFormatters.get(locale);
  if (!secondsFormatter) {
    secondsFormatter = new Intl.NumberFormat(locale, { minimumIntegerDigits: 2 });
    countdownSecondFormatters.set(locale, secondsFormatter);
  }
  return `${formatNumber(Math.floor(wholeSeconds / SECONDS_PER_MINUTE), locale)}:${secondsFormatter.format(wholeSeconds % SECONDS_PER_MINUTE)}`;
}
