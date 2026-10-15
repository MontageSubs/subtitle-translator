import { getLocale, parseLanguageTag } from "../i18n";
import { inferScript } from "../i18n/negotiate";
import { languageName, nativeLanguageName } from "./languageNames";
import { languagePinyinInitials, languageZhuyinInitials } from "./languagePhonetics";

function stripAccents(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function matchesLanguageQuery(code: string, query: string, nativeCodes: readonly string[] = [code]): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const plainNeedle = stripAccents(needle);
  const locale = getLocale();
  const names = [languageName(code, locale), languageName(code, "en"), nativeLanguageName(code)];

  if (nativeCodes.some((nativeCode) => nativeCode.toLowerCase().includes(needle)) || code.toLowerCase().includes(needle) || names.some((name) => name.toLowerCase().includes(needle) || stripAccents(name).includes(plainNeedle))) {
    return true;
  }

  const tag = parseLanguageTag(locale);
  if (tag.language !== "zh") return false;
  return inferScript(tag) === "Hant" ? languageZhuyinInitials(code).includes(query.trim()) : languagePinyinInitials(code).toLowerCase().includes(needle);
}
