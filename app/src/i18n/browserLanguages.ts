import { LOCALES } from "./catalog";
import type { LocaleCode } from "./locales.config";
import { matchInterfaceLocale } from "./negotiate";

let reportedTags: readonly string[] | undefined;
let preferredLocales: readonly LocaleCode[] | undefined;

export function browserLanguageTags(): readonly string[] {
  if (reportedTags) return reportedTags;
  if (typeof navigator === "undefined") return [];
  const reported = navigator.languages?.length ? navigator.languages : navigator.language ? [navigator.language] : [];
  reportedTags = reported;
  return reportedTags;
}

export function browserPreferredLocales(): readonly LocaleCode[] {
  if (preferredLocales) return preferredLocales;
  if (typeof document === "undefined") return [];
  const preferred: LocaleCode[] = [];
  for (const tag of browserLanguageTags()) {
    const locale = matchInterfaceLocale([tag], LOCALES, "") as LocaleCode | "";
    if (locale && !preferred.includes(locale)) preferred.push(locale);
  }
  preferredLocales = preferred;
  return preferredLocales;
}
