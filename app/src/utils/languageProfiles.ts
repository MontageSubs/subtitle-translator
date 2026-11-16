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
  ja: ["ja", "en", "ko", "zh-Hans", "zh-Hant"],
  ko: ["ko", "en", "ja", "zh-Hans", "zh-Hant"],
  zh: ["zh-Hans", "en", "zh-Hant", "yue", "ja", "ko", "ug", "bo"],
  "zh-hans": ["zh-Hans", "en", "zh-Hant", "yue", "ja", "ko", "ug", "bo"],
  "zh-hant": ["zh-Hant", "en", "zh-Hans", "yue", "ja", "ko"],
  yue: ["yue", "zh-Hant", "zh-Hans", "en", "ja", "ko"],
  mn: ["mn", "ru", "en", "zh-Hans", "ko", "kk"],

  bn: ["bn", "en", "hi", "ur", "ko", "tr", "ja", "ar"],
  hi: ["hi", "en", "ur", "bn", "mr", "te", "ta", "gu"],
  ta: ["ta", "en", "hi", "te", "ml", "kn", "si", "ms"],
  te: ["te", "en", "hi", "ta", "kn", "ml", "mr", "ur"],
  kn: ["kn", "en", "hi", "te", "ta", "ml", "mr"],
  ml: ["ml", "en", "hi", "ta", "kn", "te", "ar"],
  mr: ["mr", "hi", "en", "gu", "kn", "te", "ta"],
  gu: ["gu", "hi", "en", "mr", "sd", "ur"],
  pa: ["pa", "hi", "en", "ur", "gu"],
  ur: ["ur", "en", "hi", "pa", "sd", "ps", "ar", "fa"],
  sd: ["sd", "ur", "hi", "en"],
  as: ["as", "bn", "hi", "en"],
  or: ["or", "hi", "bn", "en", "te"],
  ne: ["ne", "hi", "en", "mai", "bho"],
  si: ["si", "en", "ta"],

  fil: ["fil", "ceb", "en", "ilo", "hil", "bik", "ko", "ja"],
  ceb: ["ceb", "fil", "en", "hil", "ilo", "bik", "pam", "pag"],
  ilo: ["ilo", "fil", "en", "ceb", "pag", "hil", "bik", "pam"],
  hil: ["hil", "fil", "en", "ceb", "ilo", "bik", "pam", "pag"],
  bik: ["bik", "fil", "en", "ceb", "hil", "ilo", "pam", "pag"],
  pam: ["pam", "fil", "en", "ceb", "ilo", "pag", "hil", "bik"],
  pag: ["pag", "fil", "en", "ilo", "ceb", "pam", "hil", "bik"],
  id: ["id", "en", "ms", "jv", "su", "min", "ban", "ar"],
  ms: ["ms", "en", "id", "zh-Hans", "ta", "ar", "jv", "min"],
  th: ["th", "en", "lo", "zh-Hans", "ja", "ko", "my", "km"],
  vi: ["vi", "en", "zh-Hans", "ko", "ja", "fr", "km", "th"],
  my: ["my", "en", "th", "zh-Hans", "shn"],
  km: ["km", "en", "th", "vi", "fr"],
  lo: ["lo", "th", "en", "vi", "zh-Hans"],

  de: ["de", "en", "tr", "ja", "fr", "es", "ru", "it"],
  en: ["en", "es", "fr", "de", "it", "pt"],
  es: ["es", "en", "ca", "gl", "eu", "pt", "fr", "it"],
  ca: ["ca", "es", "en", "fr", "oc", "it", "pt", "gl"],
  gl: ["gl", "es", "pt", "en", "ca", "fr"],
  eu: ["eu", "es", "fr", "en", "ca"],
  fr: ["fr", "en", "es", "it", "de", "ar", "pt", "br"],
  it: ["it", "en", "es", "fr", "de", "pt", "scn", "lmo"],
  pt: ["pt", "en", "es", "fr", "it"],
  nl: ["nl", "en", "de", "fr", "fy", "li", "es", "tr"],
  lb: ["lb", "de", "fr", "en", "pt"],

  pl: ["pl", "en", "uk", "de", "ru", "cs", "szl", "sk"],
  cs: ["cs", "en", "sk", "de", "pl", "ru"],
  sk: ["sk", "cs", "en", "hu", "pl", "de", "ru", "uk"],
  hu: ["hu", "en", "de", "ro", "sk", "sr"],
  ro: ["ro", "en", "hu", "fr", "it", "de", "es", "ru"],
  bg: ["bg", "en", "ru", "mk", "sr", "tr", "de", "uk"],
  el: ["el", "en", "tr", "sq", "bg", "de", "ru", "it"],
  hr: ["hr", "en", "bs", "sr", "sl", "de", "it", "mk"],
  sr: ["sr", "en", "hr", "bs", "mk", "sq", "ru", "de"],
  bs: ["bs", "en", "hr", "sr", "tr", "de", "sq", "mk"],
  sl: ["sl", "en", "hr", "de", "it", "sr", "bs", "hu"],
  mk: ["mk", "en", "sr", "bg", "sq", "hr", "tr"],
  sq: ["sq", "en", "it", "tr", "de", "sr", "mk", "el"],

  ru: ["ru", "en", "uk", "be", "kk", "uz", "tt", "ba"],
  uk: ["uk", "en", "ru", "pl", "be", "crh", "ro", "hu"],
  be: ["be", "ru", "en", "pl", "uk", "lt"],
  lt: ["lt", "en", "ru", "pl", "lv", "de", "be", "uk"],
  lv: ["lv", "en", "ru", "lt", "et", "ltg", "de", "pl"],
  et: ["et", "en", "fi", "ru", "lv", "lt", "sv", "de"],
  fi: ["fi", "en", "sv", "et", "ru", "no", "de"],
  sv: ["sv", "en", "no", "da", "fi", "de", "is"],
  no: ["no", "en", "sv", "da", "de", "fi", "is"],
  da: ["da", "en", "sv", "no", "de", "fo", "is"],
  is: ["is", "en", "da", "no", "sv", "fo"],
  ga: ["ga", "en", "gd", "cy", "fr"],
  cy: ["cy", "en"],

  fa: ["fa", "en", "az", "ku", "ar", "tr", "prs", "ps"],
  he: ["he", "en", "ar", "ru", "yi", "es", "fr", "am"],
  ar: ["ar", "en", "fr", "tr", "fa", "ku", "ur", "sw"],
  tr: ["tr", "en", "ku", "az", "ar", "de", "ru", "fa"],
  az: ["az", "tr", "ru", "en", "fa", "ka", "hy"],
  hy: ["hy", "ru", "en", "fa", "ka", "fr"],
  ka: ["ka", "ru", "en", "hy", "az", "tr"],
  kk: ["kk", "ru", "en", "uz", "tr", "ky"],
  uz: ["uz", "ru", "en", "tr", "kk", "tg", "ky", "tk"],
  tg: ["tg", "ru", "fa", "uz", "en"],

  am: ["am", "en", "om", "ti", "so", "ar"],
  om: ["om", "am", "en", "so", "sw", "ar"],
  ti: ["ti", "am", "en", "ar", "om"],
  so: ["so", "en", "ar", "sw", "am", "om"],
  ha: ["ha", "en", "yo", "ig", "fr", "ar"],
  yo: ["yo", "en", "ha", "ig", "fr"],
  ig: ["ig", "en", "yo", "ha", "fr"],
  sw: ["sw", "en", "ar", "fr", "rw", "lg"],
  rw: ["rw", "en", "fr", "sw", "rn", "lg"],
  af: ["af", "en", "nl", "zu", "xh", "st", "tn", "de"],
  zu: ["zu", "en", "xh", "ss", "nr", "af", "st", "tn"],
  xh: ["xh", "en", "zu", "af", "st", "tn"],

  qu: ["qu", "es", "ay", "en", "gn"],
  gn: ["gn", "es", "pt", "en", "qu"],
  ay: ["ay", "es", "qu", "en"],
  ht: ["ht", "fr", "en", "es"],
  mi: ["mi", "en", "haw", "sm", "to", "ty"],
};

const REGION_AFFINITIES: Record<string, readonly string[]> = {
  BD: ["bn"],
  BE: ["nl", "fr", "de"],
  BO: ["qu", "ay", "gn"],
  CA: ["fr"],
  CH: ["de", "fr", "it"],
  EC: ["qu"],
  ES: ["ca", "gl", "eu"],
  HK: ["yue", "zh-Hant"],
  IN: ["hi", "en", "bn", "ta", "te", "mr", "gu"],
  KE: ["sw"],
  LK: ["si", "ta"],
  NG: ["ha", "yo", "ig"],
  NP: ["ne"],
  PE: ["qu", "ay"],
  PH: ["fil", "ceb", "ilo", "hil"],
  PK: ["ur", "pa", "sd", "ps"],
  PY: ["gn"],
  SG: ["zh-Hans", "ms", "ta"],
  TZ: ["sw"],
  ZA: ["af", "zu", "xh"],
};

const INDIC_LANGUAGE_CODES = new Set(["hi", "bn", "ta", "te", "mr", "gu", "kn", "ml", "pa", "ur", "as", "or", "sa", "bho", "mai", "ne"]);

function resolveCandidateDirectCode(tag: string): string | undefined {
  const lower = tag.trim().replace(/_/g, "-").toLowerCase();
  if (lower === "zh") return "zh-Hans";
  return TAG_BY_LOWER.get(canonicalTag(lower).toLowerCase()) ?? TAG_BY_LOWER.get(parseLanguageTag(tag).language);
}

interface DeclaredLanguage {
  tag: string;
  direct: string | undefined;
  language: string;
  region: string | undefined;
}

function affinitiesOf({ tag, direct, language }: DeclaredLanguage): readonly string[] {
  const own = LINGUISTIC_AFFINITIES[tag.toLowerCase()] ?? (direct && LINGUISTIC_AFFINITIES[direct.toLowerCase()]) ?? LINGUISTIC_AFFINITIES[language] ?? [];
  return INDIC_LANGUAGE_CODES.has(language) ? [...own, ...LINGUISTIC_AFFINITIES.hi] : own;
}

export function quickPickLanguageCodes(uiLocale: string, userLanguages?: readonly string[]): string[] {
  const rawPreferences = userLanguages ?? (typeof navigator !== "undefined" && navigator.languages && navigator.languages.length > 0 ? navigator.languages : [uiLocale]);
  const declared: DeclaredLanguage[] = [uiLocale, ...rawPreferences]
    .filter((tag) => tag)
    .map((tag) => {
      const { language, region } = parseLanguageTag(tag);
      return { tag, direct: resolveCandidateDirectCode(tag), language, region };
    });
  const recommendations: string[] = [];
  const seen = new Set<string>();

  function addCode(code: string): void {
    if (VALID_CODES_SET.has(code) && !seen.has(code)) {
      seen.add(code);
      recommendations.push(code);
    }
  }

  const [interfaceLanguage, ...otherDeclared] = declared;
  if (interfaceLanguage?.direct) addCode(interfaceLanguage.direct);
  for (const { direct, language } of otherDeclared) if (direct && language !== "en") addCode(direct);
  for (const { region } of declared) for (const code of REGION_AFFINITIES[region ?? ""] ?? []) addCode(code);
  for (const entry of declared) for (const code of affinitiesOf(entry)) addCode(code);
  for (const code of LINGUISTIC_AFFINITIES.en) addCode(code);

  return recommendations.slice(0, 8);
}

export function languageLabel(code: string | undefined | null): string {
  return languageName(code || "en", getLocale());
}

export function defaultOutputMode(sourceLang: string, targetLang: string): "bilingual" | "monolingual" {
  return isChineseLanguage(targetLang) && sourceRulesFor(sourceLang).bilingualWithChineseByDefault ? "bilingual" : "monolingual";
}
