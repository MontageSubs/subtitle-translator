import { baseLanguage } from "../subtitle/common/languageCodes";
import type { ModelUseRule } from "../models/types";

const LANGUAGES_BY_WRITING_SYSTEM: Readonly<Record<string, readonly string[]>> = {
  latin: [
    "en", "es", "fr", "de", "it", "pt", "nl", "pl", "sv", "da", "no", "fi", "ro", "cs", "hu", "tr", "id", "vi", "ms", "tl", "ca", "eu", "gl", "la",
    "hr", "sk", "sl", "lt", "lv", "et", "sq", "cy", "is", "af", "az", "uz", "eo", "mt", "ga", "gd", "lb", "sw", "zu", "xh", "so", "ha", "yo", "ig",
    "mg", "mi", "sm", "jv", "su", "bs", "fy", "br", "oc", "co", "ceb", "haw", "ny", "sn", "st", "tk", "wo",
    "ace", "ach", "ak", "alz", "an", "ay", "ban", "bbc", "bem", "bew", "bik", "bm", "bts", "btx", "cgg", "cnh", "crh", "crs", "din", "dov", "dsb", "ee",
    "ff", "fj", "fo", "gaa", "gn", "hil", "hmn", "hrx", "hsb", "ht", "ikt", "ilo", "kri", "ktu", "ku", "lg", "li", "lij", "lmo", "ln", "ltg", "luo", "lus",
    "mak", "min", "nr", "nso", "nus", "om", "otq", "pag", "pam", "pap", "qu", "rn", "rom", "rw", "scn", "sg", "ss", "szl", "tet", "tlh", "tn", "to", "ts",
    "ty", "yua",
  ],
  han: ["zh", "yue"],
  japanese: ["ja"],
  hangul: ["ko"],
  cyrillic: ["ru", "uk", "bg", "be", "mk", "sr", "kk", "ky", "tg", "mn", "tt", "ba", "cv", "ab", "bua", "chm"],
  arabic: ["ar", "fa", "ur", "ps", "sd", "ug", "ckb", "prs", "ks"],
  hebrew: ["he", "yi"],
  greek: ["el"],
  thai: ["th"],
  lao: ["lo"],
  khmer: ["km"],
  myanmar: ["my", "shn"],
  devanagari: ["hi", "ne", "mr", "sa", "awa", "bho", "brx", "doi", "gom", "hne", "mai", "new"],
  bengali: ["bn", "as"],
  gurmukhi: ["pa"],
  gujarati: ["gu"],
  tamil: ["ta"],
  telugu: ["te"],
  kannada: ["kn"],
  malayalam: ["ml"],
  odia: ["or"],
  sinhala: ["si"],
  georgian: ["ka"],
  armenian: ["hy"],
  ethiopic: ["am", "ti"],
  tibetan: ["bo", "dz"],
  thaana: ["dv"],
  meitei: ["mni"],
};

const CASED_WRITING_SYSTEMS: ReadonlySet<string> = new Set(["latin", "cyrillic", "greek", "armenian"]);

const SYSTEMS_WITH_LANGUAGE_SPECIFIC_NAMES: ReadonlySet<string> = new Set(["cyrillic", "arabic", "hebrew", "han"]);

const WRITING_SYSTEM_BY_LANGUAGE: ReadonlyMap<string, string> = new Map(
  Object.entries(LANGUAGES_BY_WRITING_SYSTEM).flatMap(([system, languages]) => languages.map((language) => [language, system] as const)),
);

export const isCasedLanguage = (language: string): boolean => CASED_WRITING_SYSTEMS.has(WRITING_SYSTEM_BY_LANGUAGE.get(baseLanguage(language)) ?? "");

export function namesVaryBetween(source: string, target: string): boolean {
  const from = baseLanguage(source);
  const to = baseLanguage(target);
  if (from === to) return false;
  const fromSystem = WRITING_SYSTEM_BY_LANGUAGE.get(from);
  const toSystem = WRITING_SYSTEM_BY_LANGUAGE.get(to);
  if (fromSystem === undefined || toSystem === undefined) return false;
  return fromSystem !== toSystem || SYSTEMS_WITH_LANGUAGE_SPECIFIC_NAMES.has(fromSystem);
}

export const usesModelForPair = (rule: ModelUseRule | undefined, source: string, target: string): boolean => rule !== "names-vary" || namesVaryBetween(source, target);
