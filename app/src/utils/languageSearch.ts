import { getLocale } from "../i18n";
import { formatLanguage } from "./languageNames";
import { languagePinyinInitials, languageZhuyinInitials } from "./languagePhonetics";

export function matchesLanguageQuery(code: string, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (formatLanguage(code, getLocale()).toLowerCase().includes(needle) || code.toLowerCase().includes(needle)) return true;
  switch (getLocale()) {
    case "zh-Hans": return languagePinyinInitials(code).toLowerCase().includes(needle);
    case "zh-Hant": return languageZhuyinInitials(code).includes(query.trim());
    default: return false;
  }
}
