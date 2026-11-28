import { isNamespacedKey, STORAGE_KEYS } from "../config/storage";
import { persistentStorage } from "../utils/safeStorage";
import { browserPreferredLocales } from "./browserLanguages";
import { isLocaleCode } from "./catalog";
import { DEFAULT_LOCALE, LocaleCode } from "./locales.config";
import { planVisit, preferredLocaleOf } from "./preferenceRules";

const hasStoredAppData = (): boolean => {
  try {
    return Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).some((name) => name !== null && isNamespacedKey(name));
  } catch {
    return false;
  }
};

const returningVisitor = hasStoredAppData();

const browserMatch = (): LocaleCode => browserPreferredLocales()[0] ?? "";

function storedLocale(key: string): LocaleCode | null {
  const locale = persistentStorage.getItem(key);
  return locale && isLocaleCode(locale) ? locale : null;
}

const storedChoice = (): LocaleCode | null => storedLocale(STORAGE_KEYS.locale);

export function preferredLocale(): LocaleCode {
  return preferredLocaleOf({ choice: storedChoice(), seenMatch: persistentStorage.getItem(STORAGE_KEYS.localeSeenMatch), browserMatch: browserMatch() });
}

export function rememberLocale(locale: LocaleCode): void {
  persistentStorage.setItem(STORAGE_KEYS.locale, locale);
  persistentStorage.setItem(STORAGE_KEYS.localeSeenMatch, browserMatch());
  persistentStorage.removeItem(STORAGE_KEYS.localeSwitchedFrom);
  persistentStorage.removeItem(STORAGE_KEYS.localeOfferDismissed);
}

export function offeredLocale(page: LocaleCode): LocaleCode | undefined {
  const dismissed = persistentStorage.getItem(STORAGE_KEYS.localeOfferDismissed);
  return [storedLocale(STORAGE_KEYS.localeSwitchedFrom), preferredLocale()].find((locale): locale is LocaleCode => Boolean(locale) && locale !== page && locale !== dismissed);
}

export function dismissLocaleOffer(locale: LocaleCode): void {
  persistentStorage.setItem(STORAGE_KEYS.localeOfferDismissed, locale);
  persistentStorage.removeItem(STORAGE_KEYS.localeSwitchedFrom);
}

function initialSeenMatch(choice: LocaleCode | null): string {
  const awaitsFirstRouting = returningVisitor && choice === null && !persistentStorage.getItem(STORAGE_KEYS.localeAutoSelected);
  return awaitsFirstRouting ? "" : browserMatch();
}

export function reconcileVisit(page: LocaleCode): LocaleCode | undefined {
  const choice = storedChoice();
  const seenMatch = persistentStorage.getItem(STORAGE_KEYS.localeSeenMatch) ?? initialSeenMatch(choice);
  const plan = planVisit(page, choice, seenMatch, browserMatch(), DEFAULT_LOCALE);
  persistentStorage.setItem(STORAGE_KEYS.localeSeenMatch, plan.seenMatch);
  if (persistentStorage.getItem(STORAGE_KEYS.localeSeenMatch) !== plan.seenMatch) return undefined;
  persistentStorage.removeItem(STORAGE_KEYS.localeAutoSelected);
  if (plan.retiresChoice) persistentStorage.removeItem(STORAGE_KEYS.locale);
  if (plan.switchedFrom) {
    persistentStorage.setItem(STORAGE_KEYS.localeSwitchedFrom, plan.switchedFrom);
    persistentStorage.removeItem(STORAGE_KEYS.localeOfferDismissed);
  }
  return plan.redirect;
}
