const UNIVERSAL_LANGUAGE_ALIASES: Readonly<Record<string, readonly string[]>> = {
  fil: ["tagalog", "pilipino", "tl"],
};

const BENGALI_ROMANIZED_ALIASES: Readonly<Record<string, readonly string[]>> = {
  ar: ["arabi", "arbi"],
  bn: ["bangla", "bengali", "bangali"],
  de: ["jarman", "german", "germani"],
  en: ["ingreji", "english", "engreji"],
  es: ["spanish", "spenish"],
  fa: ["farsi", "parsi", "pharsi"],
  fr: ["farasi", "frenc", "french"],
  hi: ["hindi"],
  id: ["indonesia", "indonesian"],
  it: ["italiyan", "italian"],
  ja: ["japani", "japanese"],
  ko: ["koriyan", "korean"],
  ms: ["malay", "malaya"],
  ne: ["nepali"],
  pa: ["punjabi", "panjabi"],
  ru: ["rushiyan", "rashiyan", "russian"],
  ta: ["tamil"],
  te: ["telugu"],
  th: ["thai"],
  tr: ["turki", "turkish"],
  ur: ["urdu"],
  vi: ["vietnami", "vietnamese"],
  zh: ["chini", "cini", "chinese"],
};

const ROMANIZED_ALIASES_BY_UI_LANGUAGE: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>> = {
  bn: BENGALI_ROMANIZED_ALIASES,
};

function includesNeedle(aliases: readonly string[] | undefined, needle: string): boolean {
  return aliases !== undefined && aliases.some((alias) => alias.includes(needle));
}

export function matchesLanguageAlias(code: string, needle: string, uiLanguage: string): boolean {
  const baseCode = code.split("-")[0];
  return includesNeedle(UNIVERSAL_LANGUAGE_ALIASES[baseCode], needle) || includesNeedle(ROMANIZED_ALIASES_BY_UI_LANGUAGE[uiLanguage]?.[baseCode], needle);
}
