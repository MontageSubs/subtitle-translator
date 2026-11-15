import { LOCALES } from "../i18n/catalog";
import { getLocale } from "../i18n";
import { matchPreferredLocale } from "../i18n/negotiate";
import { prefetchBuildGroups } from "./buildChannel";
import { isOnFastConnection, runUnlessConserving } from "./resourceSaving";

const MAX_PREFETCHED_LOCALES = 2;
const LOCALE_GROUP_PREFIX = "locale:";

function candidateLocales(): string[] {
  const current = getLocale();
  const reported = navigator.languages.map((language) => matchPreferredLocale([language], LOCALES, ""));
  return [...new Set(reported)].filter((locale) => locale !== "" && locale !== current).slice(0, MAX_PREFETCHED_LOCALES);
}

export function prefetchCandidateLocales(): void {
  if (!isOnFastConnection()) return;
  void runUnlessConserving(() => prefetchBuildGroups(candidateLocales().map((locale) => `${LOCALE_GROUP_PREFIX}${locale}`))).catch(() => undefined);
}
