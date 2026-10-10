import { languageKey } from "../subtitle/common/languageCodes";



interface LanguageTable {
  codes: ReadonlySet<string>;
  aliases: Readonly<Record<string, string>>;
  simplified: string;
  traditional: string;
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
  aliases: {},
  simplified: "zh-CN",
  traditional: "zh-TW",
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
  aliases: { no: "nb", tl: "fil", sr: "sr-Cyrl", mn: "mn-Cyrl" },
  simplified: "zh-Hans",
  traditional: "zh-Hant",
};

const TABLES: Readonly<Record<string, LanguageTable>> = {
  "google-nmt-v2": GOOGLE_TABLE,
  "google-nmt-pa": GOOGLE_TABLE,
  "microsoft-nmt-edge": MICROSOFT_TABLE,
};

const lookups = new WeakMap<LanguageTable, ReadonlyMap<string, string>>();

function canonicalCodes(table: LanguageTable): ReadonlyMap<string, string> {
  let known = lookups.get(table);
  if (!known) lookups.set(table, (known = new Map([...table.codes].map((code) => [code.toLowerCase(), code]))));
  return known;
}

export function resolveProviderLanguage(provider: string, code: string): string | null {
  const table = TABLES[provider];
  if (!table) return code;
  const key = languageKey(code);
  if (key === "zh-hans") return table.simplified;
  if (key === "zh-hant") return table.traditional;
  const known = canonicalCodes(table);
  const regional = code.trim().toLowerCase().replace(/_/g, "-");
  const alias = table.aliases[key] ?? key;
  return known.get(regional) ?? known.get(alias.toLowerCase()) ?? null;
}
