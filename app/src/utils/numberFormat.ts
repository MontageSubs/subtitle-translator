const numberFormatters = new Map<string, Intl.NumberFormat>();
const percentFormatters = new Map<string, Intl.NumberFormat>();

function formatterFor(cache: Map<string, Intl.NumberFormat>, locale: string, options?: Intl.NumberFormatOptions): Intl.NumberFormat {
  let formatter = cache.get(locale);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, options);
    cache.set(locale, formatter);
  }
  return formatter;
}

export const formatNumber = (value: number, locale: string): string => formatterFor(numberFormatters, locale).format(value);

export const formatWholePercent = (percent: number, locale: string): string =>
  formatterFor(percentFormatters, locale, { style: "percent", maximumFractionDigits: 0 }).format(percent / 100);
