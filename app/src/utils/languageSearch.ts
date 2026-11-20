import { getLocale, parseLanguageTag } from "../i18n";
import { inferScript } from "../i18n/negotiate";
import { arabicLanguageAliases, matchesArabicQuery } from "./languageArabic";
import { matchesHebrewQuery } from "./languageHebrew";
import { matchesPersianQuery, persianLanguageAliases } from "./languagePersian";
import { matchesRussianQuery, russianLanguageAliases } from "./languageRussian";
import { matchesUkrainianQuery, ukrainianLanguageAliases } from "./languageUkrainian";
import { languageName, nativeLanguageName } from "./languageNames";
import { matchesLanguageAlias } from "./languageAliases";
import { containsKana, matchesJapaneseQuery } from "./languageJapanese";
import { languagePinyinInitials, languageZhuyinInitials } from "./languagePhonetics";

const STROKED_LETTER_FOLDS: Readonly<Record<string, string>> = { ł: "l", đ: "d", ð: "d", ø: "o", ı: "i", ß: "ss", æ: "ae", œ: "oe", þ: "th" };
const UMLAUT_DIGRAPH = /([aou])e/g;
const STROKED_LETTERS = new RegExp(`[${Object.keys(STROKED_LETTER_FOLDS).join("")}]`, "g");

export function stripAccents(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(STROKED_LETTERS, (letter) => STROKED_LETTER_FOLDS[letter]);
}

export function matchesLanguageQuery(code: string, query: string, nativeCodes: readonly string[] = [code]): boolean {
  const needle = query.normalize("NFKC").trim().toLowerCase();
  if (!needle) return true;
  const plainNeedle = stripAccents(needle);
  const umlautNeedle = plainNeedle.replace(UMLAUT_DIGRAPH, "$1");
  const locale = getLocale();
  const names = [languageName(code, locale), languageName(code, "en"), nativeLanguageName(code)];

  if (nativeCodes.some((nativeCode) => nativeCode.toLowerCase().includes(needle)) || code.toLowerCase().includes(needle) || names.some((name) => name.toLowerCase().includes(needle) || stripAccents(name).includes(plainNeedle) || stripAccents(name).includes(umlautNeedle))) {
    return true;
  }

  const tag = parseLanguageTag(locale);
  if (matchesLanguageAlias(code, plainNeedle, tag.language)) return true;
  if (tag.language === "ja" || containsKana(needle)) return matchesJapaneseQuery(code, needle, tag.language === "ja");
  if (tag.language === "he") return matchesHebrewQuery(needle, [...names, code]);
  if (tag.language === "ar") return matchesArabicQuery(needle, [...names, code, ...arabicLanguageAliases(code)]);
  if (tag.language === "fa") return matchesPersianQuery(needle, [...names, code, ...persianLanguageAliases(code)]);
  if (tag.language === "ru") return matchesRussianQuery(needle, [...names, code, ...russianLanguageAliases(code)]);
  if (tag.language === "uk") return matchesUkrainianQuery(needle, [...names, code, ...ukrainianLanguageAliases(code)]);
  if (tag.language !== "zh") return false;
  return inferScript(tag) === "Hant" ? languageZhuyinInitials(code).includes(query.trim()) : languagePinyinInitials(code).toLowerCase().includes(needle);
}
