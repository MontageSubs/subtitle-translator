import { getLocale } from "../i18n";
import { parseLanguageTag } from "../i18n/negotiate";
import { ALL_LANGUAGE_TAGS, canonicalTag } from "./providerLanguages";
import { isChineseLanguage } from "../lib/subtitle/common/languageCodes";
import { languageName } from "./languageNames";
import { sourceRulesFor } from "../lib/subtitle/language/resolve";

export const AUTO_DETECT_CODE = "auto";

export const SELECTABLE_LANGUAGE_CODES: readonly string[] = ALL_LANGUAGE_TAGS;

const VALID_CODES_SET = new Set(SELECTABLE_LANGUAGE_CODES);
const TAG_BY_LOWER: ReadonlyMap<string, string> = new Map(SELECTABLE_LANGUAGE_CODES.map((tag) => [tag.toLowerCase(), tag]));

const LINGUISTIC_AFFINITIES: Record<string, readonly string[]> = {
  ja: ["ja", "ko", "zh-Hant", "zh-Hans", "en"],
  ko: ["ko", "ja", "zh-Hant", "zh-Hans", "en"],
  zh: ["zh-Hans", "zh-Hant", "yue", "lzh", "ug", "bo", "hmn", "en", "ja"],
  "zh-hans": ["zh-Hans", "zh-Hant", "yue", "lzh", "ug", "bo", "hmn", "ja", "en"],
  "zh-hant": ["zh-Hant", "zh-Hans", "yue", "lzh", "hmn", "ja", "en"],

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

function resolveCandidateDirectCode(tag: string): string | undefined {
  const lower = tag.trim().replace(/_/g, "-").toLowerCase();
  if (lower === "zh") return "zh-Hans";
  return TAG_BY_LOWER.get(canonicalTag(lower).toLowerCase()) ?? TAG_BY_LOWER.get(parseLanguageTag(tag).language);
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

    const { language, region } = parseLanguageTag(tag);

    if (region === "IN" || INDIC_LANGUAGE_CODES.has(language)) {
      const indicGeneral = LINGUISTIC_AFFINITIES.hi;
      if (indicGeneral) {
        for (const code of indicGeneral) addCode(code);
      }
    }

    const affinityList = LINGUISTIC_AFFINITIES[tag.toLowerCase()] ?? LINGUISTIC_AFFINITIES[language];
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

export function defaultOutputMode(sourceLang: string, targetLang: string): "bilingual" | "monolingual" {
  return isChineseLanguage(targetLang) && sourceRulesFor(sourceLang).bilingualWithChineseByDefault ? "bilingual" : "monolingual";
}
