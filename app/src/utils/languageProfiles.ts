import { getLocale } from "../i18n";
import { allKnownLanguageCodes, languageDisplayName } from "./languageNames";

export interface LanguageProfile {
  code: string;
  defaultBilingualWithChinese: boolean;
  maxCharsPerLine: number;
  readingSpeedCps: number;
}

const CJK_CODES = new Set(["zh", "ja", "ko", "yue"]);
const LATIN_CODES = new Set([
  "en", "es", "fr", "de", "it", "pt", "nl", "pl", "sv", "da", "no", "nb", "fi", "ro",
  "cs", "hu", "tr", "id", "vi", "ms", "tl", "fil", "ca", "eu", "gl", "la", "hr", "sk",
  "sl", "lt", "lv", "et", "sq", "cy", "is", "af",
]);

const BILINGUAL_WITH_CHINESE_CODES = new Set(["en", "ja"]);

function baseCode(code: string): string {
  return code.split("-")[0].toLowerCase();
}

function profile(code: string): LanguageProfile {
  const base = baseCode(code);
  const isCjk = CJK_CODES.has(base);
  const isLatin = LATIN_CODES.has(base);
  const maxCharsPerLine = isCjk ? 16 : 42;
  const readingSpeedCps = isCjk ? 9 : isLatin ? 20 : 17;
  return { code, defaultBilingualWithChinese: BILINGUAL_WITH_CHINESE_CODES.has(base), maxCharsPerLine, readingSpeedCps };
}

const ALL_CODES = allKnownLanguageCodes().filter((code) => code !== "zh" && code !== "zh-Hans" && code !== "zh-Hant");
const FALLBACK_PROFILE: LanguageProfile = profile("en");

export function languageLabel(code: string | undefined | null): string {
  return languageDisplayName(code || "en", getLocale());
}

export function languageProfile(code: string | undefined | null): LanguageProfile {
  const raw = code || "en";
  const base = baseCode(raw);
  if (base === "zh") return profile(raw.toLowerCase().includes("hant") ? "zh-Hant" : "zh-Hans");
  return ALL_CODES.includes(base) ? profile(raw) : FALLBACK_PROFILE;
}

export function isChineseTarget(code: string | undefined | null): boolean {
  return baseCode(code || "") === "zh";
}

export function isCjkLanguage(code: string | undefined | null): boolean {
  return CJK_CODES.has((code || "").split("-")[0].toLowerCase());
}

export function defaultOutputMode(sourceLang: string, targetLang: string): "bilingual" | "monolingual" {
  if (!isChineseTarget(targetLang)) return "monolingual";
  return languageProfile(sourceLang).defaultBilingualWithChinese ? "bilingual" : "monolingual";
}

export const AUTO_DETECT_CODE = "auto";

export const TARGET_LANGUAGES: LanguageProfile[] = [
  profile("zh-Hans"), profile("zh-Hant"),
  ...ALL_CODES.map((code) => profile(code)),
];

export const SOURCE_LANGUAGES: LanguageProfile[] = [
  profile("zh-Hans"), profile("zh-Hant"),
  ...ALL_CODES.map((code) => profile(code)),
];

const QUICK_PICK_FAMILIES: Record<string, string[]> = {
  "zh-Hans": ["zh-Hans", "zh-Hant", "yue"],
  "zh-Hant": ["zh-Hant", "zh-Hans", "yue"],
  en: [],
};

export function quickPickLanguageCodes(uiLocale: string): string[] {
  return QUICK_PICK_FAMILIES[uiLocale] || [];
}
