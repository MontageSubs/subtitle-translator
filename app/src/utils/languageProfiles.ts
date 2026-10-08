import { getLocale } from "../i18n";
import { allKnownLanguageCodes, languageDisplayName } from "./languageNames";
import { sourceRulesFor } from "../lib/subtitle/language/resolve";

export const AUTO_DETECT_CODE = "auto";

const CHINESE_VARIANTS = ["zh-Hans", "zh-Hant"];
const UNLISTED_CHINESE_CODES = new Set(["zh", ...CHINESE_VARIANTS]);

export const SELECTABLE_LANGUAGE_CODES: readonly string[] = [
  ...CHINESE_VARIANTS,
  ...allKnownLanguageCodes().filter((code) => !UNLISTED_CHINESE_CODES.has(code)),
];

const QUICK_PICK_FAMILIES: Record<string, string[]> = {
  "zh-Hans": ["zh-Hans", "zh-Hant", "yue"],
  "zh-Hant": ["zh-Hant", "zh-Hans", "yue"],
  en: ["en"],
};

export function languageLabel(code: string | undefined | null): string {
  return languageDisplayName(code || "en", getLocale());
}

function isChineseTarget(code: string | undefined | null): boolean {
  return (code || "").split("-")[0].toLowerCase() === "zh";
}

export function defaultOutputMode(sourceLang: string, targetLang: string): "bilingual" | "monolingual" {
  return isChineseTarget(targetLang) && sourceRulesFor(sourceLang).bilingualWithChineseByDefault ? "bilingual" : "monolingual";
}

export function quickPickLanguageCodes(uiLocale: string): string[] {
  return QUICK_PICK_FAMILIES[uiLocale] || [uiLocale];
}
