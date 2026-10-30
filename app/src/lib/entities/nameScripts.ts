import { baseLanguage } from "../subtitle/common/languageCodes";
import type { ModelUseRule } from "../models/types";

const LANGUAGES_BY_WRITING_SYSTEM: Readonly<Record<string, readonly string[]>> = {
  latin: [
    "en", "es", "fr", "de", "it", "pt", "nl", "pl", "sv", "da", "no", "fi", "ro", "cs", "hu", "tr", "id", "vi", "ms", "tl", "ca", "eu", "gl", "la",
    "hr", "sk", "sl", "lt", "lv", "et", "sq", "cy", "is", "af", "az", "uz", "eo", "mt", "ga", "gd", "lb", "sw", "zu", "xh", "so", "ha", "yo", "ig",
    "mg", "mi", "sm", "jv", "su", "bs", "fy", "br", "oc", "co", "ceb", "haw", "ny", "sn", "st", "tk", "wo",
  ],
  han: ["zh", "yue"],
  japanese: ["ja"],
  hangul: ["ko"],
  cyrillic: ["ru", "uk", "bg", "be", "mk", "sr", "kk", "ky", "tg", "mn", "tt", "ba", "cv"],
  arabic: ["ar", "fa", "ur", "ps", "sd", "ug"],
  hebrew: ["he", "yi"],
  greek: ["el"],
  thai: ["th"],
  lao: ["lo"],
  khmer: ["km"],
  myanmar: ["my"],
  devanagari: ["hi", "ne", "mr", "sa"],
  bengali: ["bn", "as"],
  gurmukhi: ["pa"],
  gujarati: ["gu"],
  tamil: ["ta"],
  telugu: ["te"],
  kannada: ["kn"],
  malayalam: ["ml"],
  sinhala: ["si"],
  georgian: ["ka"],
  armenian: ["hy"],
  ethiopic: ["am", "ti"],
  tibetan: ["bo"],
};

const WRITING_SYSTEM_BY_LANGUAGE: ReadonlyMap<string, string> = new Map(
  Object.entries(LANGUAGES_BY_WRITING_SYSTEM).flatMap(([system, languages]) => languages.map((language) => [language, system] as const)),
);

export function usesModelForPair(rule: ModelUseRule | undefined, source: string, target: string): boolean {
  if (rule !== "script-differs") return true;
  const from = WRITING_SYSTEM_BY_LANGUAGE.get(baseLanguage(source));
  const to = WRITING_SYSTEM_BY_LANGUAGE.get(baseLanguage(target));
  return from !== undefined && to !== undefined && from !== to;
}
