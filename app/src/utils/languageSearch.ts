import { getLocale } from "../i18n";
import { languageName } from "./languageNames";
import { languagePinyinInitials, languageZhuyinInitials } from "./languagePhonetics";

function stripAccents(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function matchesLanguageQuery(code: string, query: string): boolean {
  const rawNeedle = query.trim().toLowerCase();
  if (!rawNeedle) return true;
  const needle = stripAccents(rawNeedle);

  const localized = languageName(code, getLocale());
  const english = languageName(code, "en");
  const native = languageName(code, code);

  if (
    code.toLowerCase().includes(rawNeedle) ||
    localized.toLowerCase().includes(rawNeedle) ||
    english.toLowerCase().includes(rawNeedle) ||
    native.toLowerCase().includes(rawNeedle) ||
    stripAccents(localized).includes(needle) ||
    stripAccents(english).includes(needle) ||
    stripAccents(native).includes(needle)
  ) {
    return true;
  }

  const currentLocale = getLocale();
  if (currentLocale === "zh-Hans") {
    return languagePinyinInitials(code).toLowerCase().includes(rawNeedle);
  }
  if (currentLocale === "zh-Hant") {
    return languageZhuyinInitials(code).includes(query.trim());
  }

  return false;
}
