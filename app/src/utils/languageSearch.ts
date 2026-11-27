import { getLocale, parseLanguageTag } from "../i18n";
import { inferScript } from "../i18n/negotiate";
import { containsArabicScript } from "./arabicScript";
import { arabicLanguageAliases, matchesArabicQuery } from "./languageArabic";
import { greekLanguageAliases, matchesGreekQuery } from "./languageGreek";
import { matchesHebrewQuery } from "./languageHebrew";
import { containsHangul, matchesKoreanQuery } from "./languageKorean";
import { containsIndicScript, hindiLanguageAliases, matchesIndicQuery, tamilLanguageAliases } from "./languageIndic";
import { matchesPersianQuery, persianLanguageAliases } from "./languagePersian";
import { matchesRussianQuery, russianLanguageAliases } from "./languageRussian";
import { matchesUrduQuery, urduLanguageAliases } from "./languageUrdu";
import { matchesUkrainianQuery, ukrainianLanguageAliases } from "./languageUkrainian";
import { matchesUzbekQuery, uzbekLanguageAliases } from "./languageUzbek";
import { containsThai, matchesThaiQuery, thaiLanguageAliases } from "./languageThai";
import { languageName, nativeLanguageName } from "./languageNames";
import { matchesLanguageAlias, withoutBahasaPrefix } from "./languageAliases";
import { containsKana, matchesJapaneseQuery } from "./languageJapanese";
import { languagePinyinInitials, languageZhuyinInitials } from "./languagePhonetics";

const INDIC_UI_LANGUAGES: ReadonlySet<string> = new Set(["hi", "bn", "ta", "te", "ml", "kn", "mr", "gu", "pa", "ne"]);

const STROKED_LETTER_FOLDS: Readonly<Record<string, string>> = { ł: "l", đ: "d", ð: "d", ø: "o", ı: "i", ß: "ss", æ: "ae", œ: "oe", þ: "th" };
const ARABIC_SCRIPT_UI_LANGUAGES: readonly string[] = ["ar", "fa", "ur"];
const UMLAUT_DIGRAPH = /([aou])e/g;
const STROKED_LETTERS = new RegExp(`[${Object.keys(STROKED_LETTER_FOLDS).join("")}]`, "g");

export function stripAccents(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(STROKED_LETTERS, (letter) => STROKED_LETTER_FOLDS[letter]);
}

export function matchesLanguageQuery(code: string, query: string, nativeCodes: readonly string[] = [code]): boolean {
  const needle = withoutBahasaPrefix(query.normalize("NFKC").trim().toLowerCase());
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
  if (INDIC_UI_LANGUAGES.has(tag.language) || containsIndicScript(needle)) {
    return matchesIndicQuery(needle, [...names, ...(tag.language === "ta" ? tamilLanguageAliases(code) : hindiLanguageAliases(code))], tag.language);
  }
  if (tag.language === "th" || containsThai(needle)) return matchesThaiQuery(needle, [...names, code, ...thaiLanguageAliases(code)]);
  if (tag.language === "ko" || containsHangul(needle)) return matchesKoreanQuery(query, [...names, code], code);
  if (tag.language === "ja" || containsKana(needle)) return matchesJapaneseQuery(code, needle, tag.language === "ja");
  if (tag.language === "el") return matchesGreekQuery(needle, [...names, code, ...greekLanguageAliases(code)]);
  if (tag.language === "he") return matchesHebrewQuery(needle, [...names, code]);
  if (tag.language === "ar") return matchesArabicQuery(needle, [...names, code, ...arabicLanguageAliases(code)]);
  if (tag.language === "fa") return matchesPersianQuery(needle, [...names, code, ...persianLanguageAliases(code)]);
  if (tag.language === "ur") return matchesUrduQuery(needle, [...names, code, ...urduLanguageAliases(code)]);
  if (tag.language === "ru") return matchesRussianQuery(needle, [...names, code, ...russianLanguageAliases(code)]);
  if (tag.language === "uk") return matchesUkrainianQuery(needle, [...names, code, ...ukrainianLanguageAliases(code)]);
  if (tag.language === "uz") return matchesUzbekQuery(needle, [...names, languageName(code, "ru"), code, ...uzbekLanguageAliases(code)]);
  if (containsArabicScript(needle)) {
    const arabicScriptNames = [...names, code, ...ARABIC_SCRIPT_UI_LANGUAGES.map((language) => languageName(code, language))];
    return (
      matchesArabicQuery(needle, [...arabicScriptNames, ...arabicLanguageAliases(code)]) ||
      matchesPersianQuery(needle, [...arabicScriptNames, ...persianLanguageAliases(code)]) ||
      matchesUrduQuery(needle, [...arabicScriptNames, ...urduLanguageAliases(code)])
    );
  }
  if (tag.language !== "zh") return false;
  return inferScript(tag) === "Hant" ? languageZhuyinInitials(code).includes(query.trim()) : languagePinyinInitials(code).toLowerCase().includes(needle);
}
