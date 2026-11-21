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
  "zh-hans": ["zh-Hans", "zh-Hant", "yue", "lzh", "ug", "bo", "hmn", "en", "ja"],
  "zh-hant": ["zh-Hant", "zh-Hans", "yue", "lzh", "hmn", "ja", "en"],
  yue: ["yue", "zh-Hant", "zh-Hans", "lzh", "ja", "ko", "en"],
  mn: ["mn", "ru", "zh-Hans", "ko", "kk", "en"],

  bn: ["bn", "en", "hi", "ur", "ko", "tr", "ja", "ar"],
  hi: ["hi", "pa", "mr", "ur", "gu", "bn", "ne", "bho"],
  ta: ["ta", "en", "hi", "te", "ml", "kn", "si", "ms"],
  te: ["te", "en", "hi", "ta", "kn", "ml", "mr", "ur"],
  kn: ["kn", "en", "hi", "te", "ta", "ml", "mr"],
  ml: ["ml", "en", "hi", "ta", "kn", "te", "ar"],
  mr: ["mr", "hi", "en", "gu", "kn", "te", "ta"],
  gu: ["gu", "hi", "en", "mr", "sd", "ur"],
  pa: ["pa", "hi", "en", "ur", "gu"],
  ur: ["ur", "en", "ar", "pa-Arab", "sd", "ps", "hi", "fa"],
  sd: ["sd", "ur", "hi", "en"],
  as: ["as", "bn", "hi", "en"],
  or: ["or", "hi", "bn", "en", "te"],
  ne: ["ne", "hi", "en", "mai", "bho"],
  si: ["si", "ta", "en"],
  "en-in": ["en", "hi", "bn", "ta", "te", "mr", "gu"],

  fil: ["fil", "ceb", "en", "ilo", "hil", "bik", "ko", "ja"],
  ceb: ["ceb", "fil", "en", "hil", "ilo", "bik", "pam", "pag"],
  ilo: ["ilo", "fil", "en", "ceb", "pag", "hil", "bik", "pam"],
  hil: ["hil", "fil", "en", "ceb", "ilo", "bik", "pam", "pag"],
  bik: ["bik", "fil", "en", "ceb", "hil", "ilo", "pam", "pag"],
  pam: ["pam", "fil", "en", "ceb", "ilo", "pag", "hil", "bik"],
  pag: ["pag", "fil", "en", "ilo", "ceb", "pam", "hil", "bik"],
  id: ["id", "jv", "su", "ms", "min", "ban", "ace", "bew"],
  ms: ["ms", "id", "en", "zh-Hans", "ta", "ar", "jv", "min"],
  th: ["th", "lo", "zh-Hans", "ja", "ko", "en", "my", "km"],
  vi: ["vi", "zh-Hans", "ko", "ja", "fr", "ru", "de", "km"],
  my: ["my", "th", "zh-Hans", "en", "shn"],
  km: ["km", "th", "vi", "en", "fr"],
  lo: ["lo", "th", "vi", "zh-Hans", "en"],

  de: ["de", "en", "tr", "ja", "fr", "es", "ru", "it"],
  en: ["en", "es", "fr", "de", "it", "pt"],
  es: ["es", "pt", "en", "fr", "it", "ca", "gl", "eu"],
  ca: ["ca", "es", "fr", "oc", "en", "it", "pt", "gl"],
  gl: ["gl", "es", "pt", "en", "ca", "fr"],
  eu: ["eu", "es", "fr", "en", "ca"],
  fr: ["fr", "es", "en", "ar", "it", "de", "pt", "br"],
  it: ["it", "fr", "es", "de", "pt", "scn", "lmo", "lij"],
  pt: ["pt", "pt-BR", "pt-PT", "es", "it", "fr", "de", "ja"],
  "pt-br": ["pt-BR", "pt-PT", "es", "it", "fr", "de", "ja", "ar"],
  "pt-pt": ["pt-PT", "pt-BR", "es", "fr", "it", "de", "gl", "lb"],
  nl: ["nl", "de", "en", "fr", "fy", "li", "es", "tr"],
  lb: ["lb", "de", "fr", "en", "pt"],

  pl: ["pl", "en", "uk", "de", "ru", "cs", "sk", "szl"],
  cs: ["cs", "sk", "en", "de", "pl", "ru"],
  sk: ["sk", "cs", "en", "hu", "pl", "de", "ru", "uk"],
  hu: ["hu", "en", "de", "ro", "sk", "sr"],
  ro: ["ro", "en", "hu", "fr", "it", "de", "es", "ru"],
  bg: ["bg", "ru", "mk", "sr", "en", "tr", "de", "uk"],
  el: ["el", "en", "tr", "sq", "bg", "de", "ru", "it"],
  hr: ["hr", "bs", "sr", "sl", "en", "de", "it", "mk"],
  sr: ["sr", "hr", "bs", "mk", "sq", "en", "ru", "de"],
  bs: ["bs", "hr", "sr", "en", "tr", "de", "sq", "mk"],
  sl: ["sl", "hr", "sr", "bs", "en", "de", "it", "hu"],
  mk: ["mk", "sr", "bg", "sq", "en", "hr", "tr"],
  sq: ["sq", "it", "tr", "en", "de", "sr", "mk", "el"],

  ru: ["ru", "uk", "be", "kk", "uz", "tt", "ba", "ky"],
  uk: ["uk", "pl", "de", "cs", "crh", "ro", "sk", "ru"],
  be: ["be", "ru", "pl", "en", "uk", "lt"],
  lt: ["lt", "lv", "en", "ru", "pl", "de", "be", "uk"],
  lv: ["lv", "lt", "en", "ru", "et", "ltg", "de", "pl"],
  et: ["et", "fi", "en", "ru", "lv", "lt", "sv", "de"],
  fi: ["fi", "sv", "en", "et", "ru", "no", "de"],
  sv: ["sv", "no", "da", "en", "fi", "de", "is"],
  no: ["no", "sv", "da", "en", "de", "fi", "is"],
  da: ["da", "sv", "no", "en", "de", "fo", "is"],
  is: ["is", "da", "no", "sv", "en", "fo"],
  ga: ["ga", "en", "gd", "cy", "fr"],
  cy: ["cy", "en"],

  fa: ["fa", "ar", "tr", "az", "en", "ckb", "prs", "ku"],
  he: ["he", "en", "ru", "ar", "fr", "es", "am", "yi"],
  ar: ["ar", "fr", "tr", "fa", "en", "ku", "ur", "sw"],
  tr: ["tr", "ku", "az", "de", "ar", "ru", "fa", "crh"],
  az: ["az", "tr", "ru", "fa", "en", "ka", "hy"],
  hy: ["hy", "ru", "fa", "en", "ka", "fr"],
  ka: ["ka", "ru", "hy", "az", "en", "tr"],
  kk: ["kk", "ru", "uz", "tr", "en", "ky"],
  uz: ["uz", "ru", "tr", "kk", "tg", "ky", "tk", "ko"],
  tg: ["tg", "ru", "fa", "uz", "en"],

  am: ["am", "om", "ti", "so", "en", "ar"],
  om: ["om", "am", "so", "sw", "en", "ar"],
  ti: ["ti", "am", "ar", "en", "om"],
  so: ["so", "ar", "en", "sw", "am", "om"],
  ha: ["ha", "ar", "ff", "fr", "yo", "ig"],
  yo: ["yo", "en", "ha", "ig", "fr"],
  ig: ["ig", "en", "yo", "ha", "fr"],
  sw: ["sw", "ar", "rw", "lg", "ln", "luo", "so", "fr"],
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
  AM: ["hy"],
  AZ: ["az"],
  BD: ["bn"],
  BE: ["nl", "fr", "de"],
  BY: ["be"],
  BO: ["qu", "ay", "gn"],
  CA: ["fr"],
  CH: ["de", "fr", "it"],
  EC: ["qu"],
  ES: ["ca", "gl", "eu"],
  GE: ["ka"],
  HK: ["yue", "zh-Hant"],
  KE: ["sw"],
  KG: ["ky", "uz"],
  KZ: ["kk"],
  LK: ["si", "ta"],
  MD: ["ro"],
  NG: ["ha", "yo", "ig"],
  NP: ["ne"],
  PE: ["qu", "ay"],
  PH: ["fil", "ceb", "ilo", "hil"],
  PK: ["ur", "pa-Arab", "sd", "ps"],
  PY: ["gn"],
  SG: ["zh-Hans", "ms", "ta"],
  TJ: ["tg", "uz"],
  TR: ["ku"],
  TZ: ["sw"],
  UA: ["uk"],
  UZ: ["uz"],
  VN: ["vi"],
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
  const specific = own === LINGUISTIC_AFFINITIES.en ? [] : own;
  return INDIC_LANGUAGE_CODES.has(language) ? [...specific, ...LINGUISTIC_AFFINITIES.hi] : specific;
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
