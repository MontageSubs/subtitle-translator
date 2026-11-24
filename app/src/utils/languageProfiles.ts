import { getLocale } from "../i18n";
import { parseLanguageTag } from "../i18n/negotiate";
import { browserLanguageTags } from "../i18n/browserLanguages";
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

  bn: ["bn", "hi", "ko", "tr", "ar", "ja", "ur"],
  hi: ["hi", "mr", "bn", "gu", "pa", "ne", "ur", "bho"],
  ta: ["ta", "ml", "te", "kn", "si", "ms", "hi"],
  te: ["te", "hi", "ta", "kn", "ml", "mr", "ur"],
  kn: ["kn", "hi", "te", "ta", "ml", "mr"],
  ml: ["ml", "hi", "ta", "kn", "te", "ar"],
  mr: ["mr", "hi", "gu", "kn", "te", "ta"],
  gu: ["gu", "hi", "mr", "sd", "ur"],
  pa: ["pa", "hi", "ur", "gu"],
  ur: ["ur", "tr", "ar", "pa-Arab", "ps", "sd", "hi"],
  sd: ["sd", "ur", "hi"],
  as: ["as", "bn", "hi"],
  or: ["or", "hi", "bn", "te"],
  ne: ["ne", "hi", "mai", "bho"],
  si: ["si", "ta"],
  "en-in": ["en", "hi", "bn", "ta", "te", "mr", "gu"],

  fil: ["fil", "ceb", "ilo", "hil", "bik", "pam", "pag"],
  ceb: ["ceb", "fil", "hil", "ilo", "bik", "pam", "pag"],
  ilo: ["ilo", "fil", "ceb", "pag", "hil", "bik", "pam"],
  hil: ["hil", "fil", "ceb", "ilo", "bik", "pam", "pag"],
  bik: ["bik", "fil", "ceb", "hil", "ilo", "pam", "pag"],
  pam: ["pam", "fil", "ceb", "ilo", "pag", "hil", "bik"],
  pag: ["pag", "fil", "ilo", "ceb", "pam", "hil", "bik"],
  id: ["id", "jv", "su", "ms", "ko", "ja", "ar"],
  ms: ["ms", "id", "zh-Hans", "ta", "ar", "jv", "min"],
  th: ["th", "zh-Hans", "ko", "ja", "zh-Hant", "lo", "my"],
  vi: ["vi", "zh-Hans", "ko", "ja", "fr", "ru", "de"],
  my: ["my", "th", "zh-Hans", "shn"],
  km: ["km", "th", "vi", "fr"],
  lo: ["lo", "th", "vi", "zh-Hans"],

  de: ["de", "tr", "ru", "ar", "uk", "pl", "ku", "ro"],
  en: ["en", "es", "fr", "de", "it", "pt"],
  es: ["es", "ca", "gl", "eu", "qu", "gn", "ay", "pt"],
  ca: ["ca", "es", "fr", "oc", "it", "pt", "gl"],
  gl: ["gl", "es", "pt", "ca", "fr"],
  eu: ["eu", "es", "fr", "ca"],
  fr: ["fr", "ar", "ht", "wo", "ln", "bm", "nl", "br"],
  it: ["it", "scn", "lmo", "lij", "ro", "sq", "ar", "uk"],
  pt: ["pt", "pt-BR", "pt-PT", "es", "fr", "it"],
  "pt-br": ["pt-BR", "es", "ja", "it", "de"],
  "pt-pt": ["pt-PT", "fr", "es", "pt-BR", "tet", "gl"],
  nl: ["nl", "de", "fr", "fy", "li", "es", "tr"],
  lb: ["lb", "de", "fr", "pt"],

  pl: ["pl", "uk", "be", "szl", "ru", "de", "cs"],
  cs: ["cs", "sk", "de", "pl", "ru"],
  sk: ["sk", "cs", "hu", "pl", "de", "ru", "uk"],
  hu: ["hu", "ro", "sk", "sr", "uk", "de"],
  ro: ["ro", "hu", "fr", "it", "de", "es", "ru"],
  bg: ["bg", "ru", "mk", "sr", "tr", "de", "uk"],
  el: ["el", "tr", "sq", "bg", "de", "ru", "it"],
  hr: ["hr", "bs", "sr", "sl", "de", "it", "mk"],
  sr: ["sr", "hr", "bs", "mk", "sq", "ru", "de"],
  bs: ["bs", "hr", "sr", "tr", "de", "sq", "mk"],
  sl: ["sl", "hr", "sr", "bs", "de", "it", "hu"],
  mk: ["mk", "sr", "bg", "sq", "hr", "tr"],
  sq: ["sq", "it", "tr", "de", "sr", "mk", "el"],

  ru: ["ru", "kk", "uz", "ky", "tg", "tt", "hy", "az"],
  uk: ["uk", "crh", "pl", "ro", "hu", "de", "cs", "sk"],
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

  fa: ["fa", "az", "tr", "ar", "ckb", "ku", "prs"],
  he: ["he", "ru", "ar", "uk", "fr", "am", "es"],
  ar: ["ar", "fr", "tr", "fa", "ckb", "ku", "so"],
  tr: ["tr", "ku", "az", "ar", "tk", "crh", "uz", "fa"],
  az: ["az", "tr", "ru", "fa", "ka", "hy"],
  hy: ["hy", "ru", "fa", "ka", "fr"],
  ka: ["ka", "ru", "hy", "az", "tr"],
  kk: ["kk", "ru", "uz", "tr", "ky"],
  uz: ["uz", "ru", "kk", "ky", "tg", "tk", "tr", "ug"],
  tg: ["tg", "ru", "fa", "uz"],

  am: ["am", "om", "ti", "so", "ar"],
  om: ["om", "am", "so", "sw", "ar"],
  ti: ["ti", "am", "ar", "om"],
  so: ["so", "ar", "sw", "am", "om"],
  ha: ["ha", "ar", "fr", "ff", "yo", "ig"],
  yo: ["yo", "ha", "ig", "fr"],
  ig: ["ig", "yo", "ha", "fr"],
  sw: ["sw", "ar", "fr", "rw", "lg", "ln", "so"],
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
  BI: ["rn", "fr"],
  BO: ["qu", "ay", "gn"],
  BR: ["pt-BR"],
  BY: ["be"],
  CA: ["fr-CA", "fr"],
  CD: ["ln", "sw", "fr"],
  CH: ["de", "fr", "it"],
  DE: ["de"],
  DZ: ["ar", "fr"],
  EC: ["qu"],
  EE: ["et"],
  ES: ["es", "ca", "gl", "eu"],
  GE: ["ka"],
  HK: ["yue", "zh-Hant"],
  HT: ["ht", "fr"],
  IL: ["he"],
  IQ: ["ar", "ckb", "ku"],
  IT: ["it"],
  KE: ["sw"],
  KG: ["ky", "uz"],
  KZ: ["kk"],
  LB: ["ar", "fr"],
  LK: ["si", "ta"],
  LT: ["lt"],
  LU: ["lb", "fr", "de"],
  LV: ["lv"],
  MA: ["ar", "fr"],
  MD: ["ro"],
  ML: ["bm", "ff", "fr"],
  MY: ["ms", "zh-Hans", "ta"],
  NE: ["ha", "fr"],
  NG: ["ha", "yo", "ig"],
  NP: ["ne"],
  PE: ["qu", "ay"],
  PH: ["fil", "ceb", "ilo", "hil"],
  PK: ["ur", "pa-Arab", "sd", "ps"],
  PL: ["pl"],
  PT: ["pt-PT"],
  PY: ["gn"],
  RW: ["rw", "fr", "sw"],
  SG: ["zh-Hans", "ms", "ta"],
  SN: ["wo", "ff", "fr"],
  TJ: ["tg", "uz"],
  TM: ["tk"],
  TN: ["ar", "fr"],
  TZ: ["sw"],
  UA: ["uk"],
  UG: ["lg", "sw"],
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
  return specific.length === 0 && INDIC_LANGUAGE_CODES.has(language) ? LINGUISTIC_AFFINITIES.hi : specific;
}

const browserQuickPicks = new Map<string, readonly string[]>();

export function quickPickLanguageCodes(uiLocale: string, userLanguages?: readonly string[]): readonly string[] {
  if (userLanguages) return computeQuickPicks(uiLocale, userLanguages);
  let picks = browserQuickPicks.get(uiLocale);
  if (!picks) {
    picks = computeQuickPicks(uiLocale, browserLanguageTags());
    browserQuickPicks.set(uiLocale, picks);
  }
  return picks;
}

function computeQuickPicks(uiLocale: string, rawPreferences: readonly string[]): string[] {
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

  const [interfaceLanguage, browserPrimary, ...otherDeclared] = declared;
  if (interfaceLanguage?.direct) addCode(interfaceLanguage.direct);
  if (browserPrimary?.direct) addCode(browserPrimary.direct);
  for (const { direct, language } of otherDeclared) if (direct && language !== "en") addCode(direct);
  for (const entry of declared) for (const code of affinitiesOf(entry)) addCode(code);
  for (const { region } of declared) for (const code of REGION_AFFINITIES[region ?? ""] ?? []) addCode(code);
  if (interfaceLanguage?.language === "en" || recommendations.length === 0) for (const code of LINGUISTIC_AFFINITIES.en) addCode(code);

  return recommendations;
}

export function languageLabel(code: string | undefined | null): string {
  return languageName(code || "en", getLocale());
}

export function defaultOutputMode(sourceLang: string, targetLang: string): "bilingual" | "monolingual" {
  return isChineseLanguage(targetLang) && sourceRulesFor(sourceLang).bilingualWithChineseByDefault ? "bilingual" : "monolingual";
}
