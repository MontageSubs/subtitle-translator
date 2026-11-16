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

export function matchesRomanizedAlias(code: string, needle: string, uiLanguage: string): boolean {
  if (uiLanguage !== "bn") return false;
  const aliases = BENGALI_ROMANIZED_ALIASES[code.split("-")[0]];
  return aliases !== undefined && aliases.some((alias) => alias.includes(needle));
}
