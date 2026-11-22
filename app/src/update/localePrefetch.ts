import { LOCALES } from "../i18n/catalog";
import { getLocale } from "../i18n";
import { matchInterfaceLocale } from "../i18n/negotiate";
import { prefetchBuildGroups } from "./buildChannel";
import { isOnFastConnection, runUnlessConserving } from "./resourceSaving";

const MAX_PREFETCHED_LOCALES = 2;
const LOCALE_GROUP_PREFIX = "locale:";

function candidateLocales(): string[] {
  const current = getLocale();
  const reported = navigator.languages.map((language) => matchInterfaceLocale([language], LOCALES, ""));
  return [...new Set(reported)].filter((locale) => locale !== "" && locale !== current).slice(0, MAX_PREFETCHED_LOCALES);
}

const requestedLocales = new Set<string>();

export function prefetchLocale(locale: string): void {
  if (requestedLocales.has(locale) || !isOnFastConnection()) return;
  requestedLocales.add(locale);
  void runUnlessConserving(() => prefetchBuildGroups([`${LOCALE_GROUP_PREFIX}${locale}`])).catch(() => undefined);
}

export function prefetchCandidateLocales(): void {
  if (!isOnFastConnection()) return;
  void runUnlessConserving(() => prefetchBuildGroups(candidateLocales().map((locale) => `${LOCALE_GROUP_PREFIX}${locale}`))).catch(() => undefined);
}
