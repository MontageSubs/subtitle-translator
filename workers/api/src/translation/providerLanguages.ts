

interface LanguageTable {
  codes: ReadonlySet<string>;
  aliases: Readonly<Record<string, string>>;
}

const GOOGLE_TABLE: LanguageTable = {
  codes: new Set([
  "ab", "ace", "ach", "af", "sq", "alz", "am", "ar", "hy", "as", "awa", "ay",
  "az", "ban", "bm", "ba", "eu", "btx", "bts", "bbc", "be", "bem", "bn", "bew",
  "bho", "bik", "bs", "br", "bg", "bua", "yue", "ca", "ceb", "ny", "zh", "zh-CN",
  "zh-TW", "cv", "co", "crh", "hr", "cs", "da", "din", "dv", "doi", "dov", "nl",
  "dz", "en", "eo", "et", "ee", "fj", "fil", "tl", "fi", "fr", "fr-FR", "fr-CA",
  "fy", "ff", "gaa", "gl", "lg", "ka", "de", "el", "gn", "gu", "ht", "cnh",
  "ha", "haw", "iw", "he", "hil", "hi", "hmn", "hu", "hrx", "is", "ig", "ilo",
  "id", "ga", "it", "ja", "jw", "jv", "kn", "pam", "kk", "km", "cgg", "rw",
  "ktu", "gom", "ko", "kri", "ku", "ckb", "ky", "lo", "ltg", "la", "lv", "lij",
  "li", "ln", "lt", "lmo", "luo", "lb", "mk", "mai", "mak", "mg", "ms", "ms-Arab",
  "ml", "mt", "mi", "mr", "chm", "mni-Mtei", "min", "lus", "mn", "my", "nr", "new",
  "ne", "nso", "no", "nus", "oc", "or", "om", "pag", "pap", "ps", "fa", "pl",
  "pt", "pt-PT", "pt-BR", "pa", "pa-Arab", "qu", "rom", "ro", "rn", "ru", "sm", "sg",
  "sa", "gd", "sr", "st", "crs", "shn", "sn", "scn", "szl", "sd", "si", "sk",
  "sl", "so", "es", "su", "sw", "ss", "sv", "tg", "ta", "tt", "te", "tet",
  "th", "ti", "ts", "tn", "tr", "tk", "ak", "uk", "ur", "ug", "uz", "vi",
  "cy", "xh", "yi", "yo", "yua", "zu",
  ]),
  aliases: { "zh-Hans": "zh-CN", "zh-Hant": "zh-TW" },
};

const MICROSOFT_TABLE: LanguageTable = {
  codes: new Set([
  "af", "sq", "am", "ar", "hy", "as", "az", "bn", "ba", "eu", "bho", "brx",
  "bs", "bg", "yue", "ca", "hne", "lzh", "zh-Hans", "zh-Hant", "sn", "hr", "cs", "da",
  "prs", "dv", "doi", "nl", "en", "et", "fo", "fj", "fil", "fi", "fr", "fr-ca",
  "gl", "ka", "de", "el", "gu", "ht", "ha", "he", "hi", "mww", "hu", "is",
  "ig", "id", "ikt", "iu", "iu-Latn", "ga", "it", "ja", "kn", "ks", "kk", "km",
  "rw", "tlh-Latn", "tlh-Piqd", "gom", "ko", "ku", "kmr", "ky", "lo", "lv", "lt", "ln",
  "dsb", "lug", "mk", "mai", "mg", "ms", "ml", "mt", "mni", "mi", "mr", "mn-Cyrl",
  "mn-Mong", "my", "ne", "nb", "nya", "or", "ps", "fa", "pl", "pt", "pt-pt", "pa",
  "otq", "ro", "run", "ru", "sm", "sr-Cyrl", "sr-Latn", "st", "nso", "tn", "sd", "si",
  "sk", "sl", "so", "es", "sw", "sv", "ty", "ta", "tt", "te", "th", "bo",
  "ti", "to", "tr", "tk", "uk", "hsb", "ur", "ug", "uz", "vi", "cy", "xh",
  "yo", "yua", "zu",
  ]),
  aliases: { "zh-CN": "zh-Hans", "zh-TW": "zh-Hant", zh: "zh-Hans", no: "nb", sr: "sr-Cyrl", mn: "mn-Cyrl" },
};

const TABLES: Readonly<Record<string, LanguageTable>> = {
  "google-nmt-v2": GOOGLE_TABLE,
  "google-nmt-pa": GOOGLE_TABLE,
  "microsoft-nmt-edge": MICROSOFT_TABLE,
};

export function resolveProviderLanguage(provider: string, code: string): string | null {
  const table = TABLES[provider];
  if (!table) return code;
  const aliased = table.aliases[code] ?? code;
  if (table.codes.has(aliased)) return aliased;
  const base = code.split("-")[0]!;
  return table.codes.has(base) ? base : null;
}
