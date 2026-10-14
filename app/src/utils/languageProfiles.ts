import { getLocale } from "../i18n";
import { LANGUAGE_CODES } from "./languageCodes";
import { languageName } from "./languageNames";
import { sourceRulesFor } from "../lib/subtitle/language/resolve";

export const AUTO_DETECT_CODE = "auto";

const CHINESE_VARIANTS = ["zh-Hans", "zh-Hant"];
const UNLISTED_CHINESE_CODES = new Set(["zh", ...CHINESE_VARIANTS]);

export const SELECTABLE_LANGUAGE_CODES: readonly string[] = [
  ...CHINESE_VARIANTS,
  ...LANGUAGE_CODES.filter((code) => !UNLISTED_CHINESE_CODES.has(code)),
];

const VALID_CODES_SET = new Set(SELECTABLE_LANGUAGE_CODES);

const LINGUISTIC_AFFINITIES: Record<string, readonly string[]> = {
  ja: ["ja", "ko", "zh-Hant", "zh-Hans", "en"],
  ko: ["ko", "ja", "zh-Hant", "zh-Hans", "en"],
  zh: ["zh-Hans", "zh-Hant", "yue", "lzh", "ug", "bo", "en", "ja"],
  "zh-hans": ["zh-Hans", "zh-Hant", "yue", "lzh", "ug", "bo", "ja", "en"],
  "zh-hant": ["zh-Hant", "zh-Hans", "yue", "lzh", "ja", "en"],

  bn: ["bn", "hi", "ur", "en"],
  hi: ["hi", "ur", "pa", "bn", "mr", "gu", "en"],
  kn: ["kn", "te", "ta", "ml", "hi", "en"],
  ml: ["ml", "kn", "te", "ta", "hi", "en"],
  ta: ["ta", "te", "kn", "ml", "hi", "en"],
  te: ["te", "ta", "kn", "ml", "hi", "en"],

  fil: ["fil", "en", "es"],
  id: ["id", "ms", "en"],
  in: ["id", "ms", "en"],
  ms: ["ms", "id", "en"],
  th: ["th", "en"],
  vi: ["vi", "en", "zh-Hans", "fr"],

  de: ["de", "nl", "en", "fr"],
  en: ["en", "es", "fr", "de", "it", "pt"],
  es: ["es", "pt", "it", "fr", "en"],
  fr: ["fr", "it", "es", "de", "ar", "en"],
  it: ["it", "es", "pt", "fr", "en"],
  pt: ["pt", "es", "it", "fr", "en"],

  pl: ["pl", "cs", "sk", "ru", "en"],
  ru: ["ru", "uk", "be", "kk", "pl", "en"],
  uk: ["uk", "ru", "be", "pl", "en"],

  am: ["am", "en", "ar"],
  ar: ["ar", "fa", "ur", "tr", "sw", "fr", "en"],
  ha: ["ha", "en", "fr", "ar"],
  sw: ["sw", "en", "ar", "fr"],
  tr: ["tr", "az", "ar", "en"],
  yo: ["yo", "en", "fr"],
};

const INDIC_LANGUAGE_CODES = new Set(["hi", "bn", "ta", "te", "mr", "gu", "kn", "ml", "pa", "ur", "as", "or", "sa", "bho", "mai", "ne"]);

function parseTagInfo(tag: string): { primary: string; script?: string; region?: string } {
  const parts = tag.trim().replace(/_/g, "-").split("-");
  const primary = parts[0].toLowerCase();
  let script: string | undefined;
  let region: string | undefined;
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    if (part.length === 4 && !script) {
      script = part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    } else if ((part.length === 2 || part.length === 3) && !region) {
      region = part.toUpperCase();
    }
  }
  return { primary, script, region };
}

function resolveCandidateDirectCode(tag: string): string | undefined {
  const lower = tag.trim().replace(/_/g, "-").toLowerCase();
  if (lower === "zh-tw" || lower === "zh-hk" || lower === "zh-mo" || lower === "zh-hant") return "zh-Hant";
  if (lower === "zh-cn" || lower === "zh-sg" || lower === "zh-hans" || lower === "zh") return "zh-Hans";
  if (VALID_CODES_SET.has(lower)) return lower;
  const { primary } = parseTagInfo(tag);
  if (VALID_CODES_SET.has(primary)) return primary;
  return undefined;
}

export function quickPickLanguageCodes(uiLocale: string, userLanguages?: readonly string[]): string[] {
  const rawPreferences = userLanguages ?? (typeof navigator !== "undefined" && navigator.languages && navigator.languages.length > 0 ? navigator.languages : [uiLocale]);
  const inputTags = [uiLocale, ...rawPreferences];
  const recommendations: string[] = [];
  const seen = new Set<string>();

  function addCode(code: string): void {
    if (VALID_CODES_SET.has(code) && !seen.has(code)) {
      seen.add(code);
      recommendations.push(code);
    }
  }

  for (const tag of inputTags) {
    if (!tag) continue;
    const direct = resolveCandidateDirectCode(tag);
    if (direct) addCode(direct);

    const { primary, region } = parseTagInfo(tag);

    if (region === "IN" || INDIC_LANGUAGE_CODES.has(primary)) {
      const indicGeneral = LINGUISTIC_AFFINITIES.hi;
      if (indicGeneral) {
        for (const code of indicGeneral) addCode(code);
      }
    }

    const affinityList = LINGUISTIC_AFFINITIES[tag.toLowerCase()] ?? LINGUISTIC_AFFINITIES[primary];
    if (affinityList) {
      for (const code of affinityList) addCode(code);
    }
  }

  for (const code of LINGUISTIC_AFFINITIES.en) addCode(code);

  return recommendations.slice(0, 8);
}

export function languageLabel(code: string | undefined | null): string {
  return languageName(code || "en", getLocale());
}

function isChineseTarget(code: string | undefined | null): boolean {
  return (code || "").split("-")[0].toLowerCase() === "zh";
}

export function defaultOutputMode(sourceLang: string, targetLang: string): "bilingual" | "monolingual" {
  return isChineseTarget(targetLang) && sourceRulesFor(sourceLang).bilingualWithChineseByDefault ? "bilingual" : "monolingual";
}
