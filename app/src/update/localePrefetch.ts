import { getLocale } from "../i18n";
import { browserPreferredLocales } from "../i18n/browserLanguages";
import { prefetchBuildGroups } from "./buildChannel";
import { isOnFastConnection, runUnlessConserving } from "./resourceSaving";

const MAX_PREFETCHED_LOCALES = 2;
const LOCALE_GROUP_PREFIX = "locale:";

function candidateLocales(): string[] {
  const current = getLocale();
  return browserPreferredLocales().filter((locale) => locale !== current).slice(0, MAX_PREFETCHED_LOCALES);
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
