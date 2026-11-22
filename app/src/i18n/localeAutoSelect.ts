import { isNamespacedKey, STORAGE_KEYS } from "../config/storage";
import { persistentStorage } from "../utils/safeStorage";
import { LOCALES } from "./catalog";
import { DEFAULT_LOCALE, LocaleCode } from "./locales.config";
import { matchInterfaceLocale } from "./negotiate";

const hasStoredAppData = (): boolean => {
  try {
    return Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).some((name) => name !== null && isNamespacedKey(name));
  } catch {
    return false;
  }
};

const returningVisitor = hasStoredAppData();

export function localeToAutoSelect(current: LocaleCode): LocaleCode | undefined {
  if (persistentStorage.getItem(STORAGE_KEYS.localeAutoSelected)) return undefined;
  persistentStorage.setItem(STORAGE_KEYS.localeAutoSelected, "1");
  if (!returningVisitor || current !== DEFAULT_LOCALE || persistentStorage.getItem(STORAGE_KEYS.locale)) return undefined;
  const { languages, language } = navigator;
  const preferred = matchInterfaceLocale(languages?.length ? languages : [language], LOCALES, DEFAULT_LOCALE) as LocaleCode;
  return preferred === current ? undefined : preferred;
}
