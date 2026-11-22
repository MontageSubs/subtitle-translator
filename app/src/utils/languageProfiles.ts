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

  bn: ["bn", "hi", "ur", "ko", "tr", "ja", "ar"],
  hi: ["hi", "pa", "mr", "ur", "gu", "bn", "ne", "bho"],
  ta: ["ta", "hi", "te", "ml", "kn", "si", "ms"],
  te: ["te", "hi", "ta", "kn", "ml", "mr", "ur"],
  kn: ["kn", "hi", "te", "ta", "ml", "mr"],
  ml: ["ml", "hi", "ta", "kn", "te", "ar"],
  mr: ["mr", "hi", "gu", "kn", "te", "ta"],
  gu: ["gu", "hi", "mr", "sd", "ur"],
  pa: ["pa", "hi", "ur", "gu"],
  ur: ["ur", "ar", "pa-Arab", "sd", "ps", "hi", "fa"],
  sd: ["sd", "ur", "hi"],
  as: ["as", "bn", "hi"],
  or: ["or", "hi", "bn", "te"],
  ne: ["ne", "hi", "mai", "bho"],
  si: ["si", "ta"],
  "en-in": ["en", "hi", "bn", "ta", "te", "mr", "gu"],

  fil: ["fil", "ceb", "ilo", "hil", "bik", "ko", "ja"],
  ceb: ["ceb", "fil", "hil", "ilo", "bik", "pam", "pag"],
  ilo: ["ilo", "fil", "ceb", "pag", "hil", "bik", "pam"],
  hil: ["hil", "fil", "ceb", "ilo", "bik", "pam", "pag"],
  bik: ["bik", "fil", "ceb", "hil", "ilo", "pam", "pag"],
  pam: ["pam", "fil", "ceb", "ilo", "pag", "hil", "bik"],
  pag: ["pag", "fil", "ilo", "ceb", "pam", "hil", "bik"],
  id: ["id", "jv", "su", "ms", "min", "ban", "ace", "bew"],
  ms: ["ms", "id", "zh-Hans", "ta", "ar", "jv", "min"],
  th: ["th", "ja", "ko", "zh-Hans", "zh-Hant", "lo", "my"],
  vi: ["vi", "zh-Hans", "ko", "ja", "fr", "ru", "de", "km"],
  my: ["my", "th", "zh-Hans", "shn"],
  km: ["km", "th", "vi", "fr"],
  lo: ["lo", "th", "vi", "zh-Hans"],

  de: ["de", "tr", "ja", "fr", "es", "ru", "it"],
  en: ["en", "es", "fr", "de", "it", "pt"],
  es: ["es", "pt", "fr", "it", "de", "ca", "gl", "eu"],
  ca: ["ca", "es", "fr", "oc", "it", "pt", "gl"],
  gl: ["gl", "es", "pt", "ca", "fr"],
  eu: ["eu", "es", "fr", "ca"],
  fr: ["fr", "es", "de", "it", "ar", "pt", "br", "oc"],
  it: ["it", "fr", "es", "de", "pt", "scn", "lmo", "lij"],
  pt: ["pt", "pt-BR", "pt-PT", "es", "it", "fr", "de", "ja"],
  "pt-br": ["pt-BR", "pt-PT", "es", "it", "fr", "de", "ja", "ar"],
  "pt-pt": ["pt-PT", "pt-BR", "es", "fr", "it", "de", "gl", "lb"],
  nl: ["nl", "de", "fr", "fy", "li", "es", "tr"],
  lb: ["lb", "de", "fr", "pt"],

  pl: ["pl", "uk", "de", "ru", "cs", "sk", "szl"],
  cs: ["cs", "sk", "de", "pl", "ru"],
  sk: ["sk", "cs", "hu", "pl", "de", "ru", "uk"],
  hu: ["hu", "de", "ro", "sk", "sr", "uk", "hr", "sl"],
  ro: ["ro", "hu", "fr", "it", "de", "es", "ru"],
  bg: ["bg", "ru", "mk", "sr", "tr", "de", "uk"],
  el: ["el", "tr", "sq", "bg", "de", "ru", "it"],
  hr: ["hr", "bs", "sr", "sl", "de", "it", "mk"],
  sr: ["sr", "hr", "bs", "mk", "sq", "ru", "de"],
  bs: ["bs", "hr", "sr", "tr", "de", "sq", "mk"],
  sl: ["sl", "hr", "sr", "bs", "de", "it", "hu"],
  mk: ["mk", "sr", "bg", "sq", "hr", "tr"],
  sq: ["sq", "it", "tr", "de", "sr", "mk", "el"],

  ru: ["ru", "uk", "be", "kk", "uz", "tt", "ba", "ky"],
  uk: ["uk", "pl", "de", "cs", "crh", "ro", "sk", "ru"],
  be: ["be", "ru", "pl", "uk", "lt"],
  lt: ["lt", "lv", "ru", "pl", "de", "be", "uk"],
  lv: ["lv", "lt", "ru", "et", "ltg", "de", "pl"],
  et: ["et", "fi", "ru", "lv", "lt", "sv", "de"],
  fi: ["fi", "sv", "et", "ru", "no", "de"],
  sv: ["sv", "no", "da", "fi", "de", "is"],
  no: ["no", "sv", "da", "de", "fi", "is"],
  da: ["da", "sv", "no", "de", "fo", "is"],
  is: ["is", "da", "no", "sv", "fo"],
  ga: ["ga", "gd", "cy", "fr"],
  cy: ["cy"],

  fa: ["fa", "en", "ar", "tr", "az", "ckb", "ku", "prs"],
  he: ["he", "en", "ru", "ar", "fr", "es", "uk", "am"],
  ar: ["ar", "en", "fr", "tr", "fa", "ckb", "ku", "ur"],
  tr: ["tr", "ku", "az", "de", "ar", "ru", "fa", "crh"],
  az: ["az", "tr", "ru", "fa", "ka", "hy"],
  hy: ["hy", "ru", "fa", "ka", "fr"],
  ka: ["ka", "ru", "hy", "az", "tr"],
  kk: ["kk", "ru", "uz", "tr", "ky"],
  uz: ["uz", "ru", "tr", "kk", "tg", "ky", "tk", "ko"],
  tg: ["tg", "ru", "fa", "uz"],

  am: ["am", "om", "ti", "so", "ar"],
  om: ["om", "am", "so", "sw", "ar"],
  ti: ["ti", "am", "ar", "om"],
  so: ["so", "ar", "sw", "am", "om"],
  ha: ["ha", "en", "ar", "ff", "fr", "yo", "ig"],
  yo: ["yo", "ha", "ig", "fr"],
  ig: ["ig", "yo", "ha", "fr"],
  sw: ["sw", "en", "ar", "rw", "lg", "ln", "so", "fr"],
  rw: ["rw", "fr", "sw", "rn", "lg"],
  af: ["af", "nl", "zu", "xh", "st", "tn", "de"],
  zu: ["zu", "xh", "ss", "nr", "af", "st", "tn"],
  xh: ["xh", "zu", "af", "st", "tn"],

  qu: ["qu", "es", "ay", "gn"],
  gn: ["gn", "es", "pt", "qu"],
  ay: ["ay", "es", "qu"],
  ht: ["ht", "fr", "es"],
  mi: ["mi", "haw", "sm", "to", "ty"],
};

const REGION_AFFINITIES: Record<string, readonly string[]> = {
  AF: ["prs", "ps", "uz"],
  AM: ["hy"],
  AZ: ["az"],
  BD: ["bn"],
  BE: ["nl", "fr", "de"],
  BY: ["be"],
  BO: ["qu", "ay", "gn"],
  BR: ["pt-BR"],
  CA: ["fr-CA", "fr"],
  CD: ["ln", "sw", "fr"],
  CH: ["de", "fr", "it"],
  DZ: ["ar", "fr"],
  EC: ["qu"],
  ES: ["es", "ca", "gl", "eu"],
  GE: ["ka"],
  HK: ["yue", "zh-Hant"],
  HT: ["ht", "fr"],
  IN: ["hi", "bn", "ta", "te", "mr"],
  IT: ["it"],
  KE: ["sw"],
  KG: ["ky", "uz"],
  KZ: ["kk"],
  LK: ["si", "ta"],
  LU: ["lb", "fr", "de"],
  MA: ["ar", "fr"],
  MD: ["ro"],
  ML: ["bm", "ff", "fr"],
  MY: ["ms", "zh-Hans", "ta"],
  NG: ["ha", "yo", "ig"],
  NP: ["ne"],
  PE: ["qu", "ay"],
  PH: ["fil", "ceb", "ilo", "hil"],
  PK: ["ur", "pa-Arab", "sd", "ps"],
  PT: ["pt-PT"],
  PY: ["gn"],
  SG: ["zh-Hans", "ms", "ta"],
  SN: ["wo", "ff", "fr"],
  TN: ["ar", "fr"],
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
