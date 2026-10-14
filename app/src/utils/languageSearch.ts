import { getLocale } from "../i18n";
import { languageName } from "./languageNames";
import { languagePinyinInitials, languageZhuyinInitials } from "./languagePhonetics";

export function matchesLanguageQuery(code: string, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  if (
    languageName(code, getLocale()).toLowerCase().includes(needle) ||
    languageName(code, "en").toLowerCase().includes(needle) ||
    code.toLowerCase().includes(needle)
  ) {
    return true;
  }
  switch (getLocale()) {
    case "zh-Hans": return languagePinyinInitials(code).toLowerCase().includes(needle);
    case "zh-Hant": return languageZhuyinInitials(code).includes(query.trim());
    default: return false;
  }
}
