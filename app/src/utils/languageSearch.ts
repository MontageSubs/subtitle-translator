import { getLocale, parseLanguageTag } from "../i18n";
import { inferScript } from "../i18n/negotiate";
import { languageName, nativeLanguageName } from "./languageNames";
import { matchesLanguageAlias } from "./languageAliases";
import { languagePinyinInitials, languageZhuyinInitials } from "./languagePhonetics";

const STROKED_LETTER_FOLDS: Readonly<Record<string, string>> = { ł: "l", đ: "d", ð: "d", ø: "o", ı: "i", ß: "ss", æ: "ae", œ: "oe", þ: "th" };
const UMLAUT_DIGRAPH = /([aou])e/g;
const STROKED_LETTERS = new RegExp(`[${Object.keys(STROKED_LETTER_FOLDS).join("")}]`, "g");

export function stripAccents(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(STROKED_LETTERS, (letter) => STROKED_LETTER_FOLDS[letter]);
}

export function matchesLanguageQuery(code: string, query: string, nativeCodes: readonly string[] = [code]): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const plainNeedle = stripAccents(needle);
  const umlautNeedle = plainNeedle.replace(UMLAUT_DIGRAPH, "$1");
  const locale = getLocale();
  const names = [languageName(code, locale), languageName(code, "en"), nativeLanguageName(code)];

  if (nativeCodes.some((nativeCode) => nativeCode.toLowerCase().includes(needle)) || code.toLowerCase().includes(needle) || names.some((name) => name.toLowerCase().includes(needle) || stripAccents(name).includes(plainNeedle) || stripAccents(name).includes(umlautNeedle))) {
    return true;
  }

  const tag = parseLanguageTag(locale);
  if (matchesLanguageAlias(code, needle, tag.language)) return true;
  if (tag.language !== "zh") return false;
  return inferScript(tag) === "Hant" ? languageZhuyinInitials(code).includes(query.trim()) : languagePinyinInitials(code).toLowerCase().includes(needle);
}
