export type ProviderId = "google-nmt-v2" | "google-nmt-pa" | "microsoft-nmt-edge" | "deepl";

interface ProviderCatalog {
  native: ReadonlyMap<string, string>;
  overrides: Readonly<Record<string, string>>;
}

const GOOGLE_CODES = [
  "ab", "ace", "ach", "af", "sq", "alz", "am", "ar", "hy", "as", "awa", "ay", "az", "ban", "bm",
  "ba", "eu", "btx", "bts", "bbc", "be", "bem", "bn", "bew", "bho", "bik", "bs", "br", "bg", "bua",
  "yue", "ca", "ceb", "ny", "zh", "zh-CN", "zh-TW", "cv", "co", "crh", "hr", "cs", "da", "din",
  "dv", "doi", "dov", "nl", "dz", "en", "eo", "et", "ee", "fj", "fil", "tl", "fi", "fr", "fr-FR",
  "fr-CA", "fy", "ff", "gaa", "gl", "lg", "ka", "de", "el", "gn", "gu", "ht", "cnh", "ha", "haw",
  "iw", "he", "hil", "hi", "hmn", "hu", "hrx", "is", "ig", "ilo", "id", "ga", "it", "ja", "jw",
  "jv", "kn", "pam", "kk", "km", "cgg", "rw", "ktu", "gom", "ko", "kri", "ku", "ckb", "ky", "lo",
  "ltg", "la", "lv", "lij", "li", "ln", "lt", "lmo", "luo", "lb", "mk", "mai", "mak", "mg", "ms",
  "ms-Arab", "ml", "mt", "mi", "mr", "chm", "mni-Mtei", "min", "lus", "mn", "my", "nr", "new",
  "ne", "nso", "no", "nus", "oc", "or", "om", "pag", "pap", "ps", "fa", "pl", "pt", "pt-PT",
  "pt-BR", "pa", "pa-Arab", "qu", "rom", "ro", "rn", "ru", "sm", "sg", "sa", "gd", "sr", "st",
  "crs", "shn", "sn", "scn", "szl", "sd", "si", "sk", "sl", "so", "es", "su", "sw", "ss", "sv",
  "tg", "ta", "tt", "te", "tet", "th", "ti", "ts", "tn", "tr", "tk", "ak", "uk", "ur", "ug", "uz",
  "vi", "cy", "xh", "yi", "yo", "yua", "zu",
];

const MICROSOFT_CODES = [
  "af", "sq", "am", "ar", "hy", "as", "az", "bn", "ba", "eu", "bho", "brx", "bs", "bg", "yue",
  "ca", "hne", "lzh", "zh-Hans", "zh-Hant", "sn", "hr", "cs", "da", "prs", "dv", "doi", "nl", "en",
  "et", "fo", "fj", "fil", "fi", "fr", "fr-ca", "gl", "ka", "de", "el", "gu", "ht", "ha", "he",
  "hi", "mww", "hu", "is", "ig", "id", "ikt", "iu", "iu-Latn", "ga", "it", "ja", "kn", "ks", "kk",
  "km", "rw", "tlh-Latn", "tlh-Piqd", "gom", "ko", "ku", "kmr", "ky", "lo", "lv", "lt", "ln",
  "dsb", "lug", "mk", "mai", "mg", "ms", "ml", "mt", "mni", "mi", "mr", "mn-Cyrl", "mn-Mong", "my",
  "ne", "nb", "nya", "or", "ps", "fa", "pl", "pt", "pt-pt", "pa", "otq", "ro", "run", "ru", "sm",
  "sr-Cyrl", "sr-Latn", "st", "nso", "tn", "sd", "si", "sk", "sl", "so", "es", "sw", "sv", "ty",
  "ta", "tt", "te", "th", "bo", "ti", "to", "tr", "tk", "uk", "hsb", "ur", "ug", "uz", "vi", "cy",
  "xh", "yo", "yua", "zu",
];

const DEEPL_CODES = [
  "AR", "BG", "CS", "DA", "DE", "EL", "EN", "EN-GB", "EN-US", "ES", "ET", "FI", "FR", "HU", "ID",
  "IT", "JA", "KO", "LT", "LV", "NB", "NL", "PL", "PT", "PT-BR", "PT-PT", "RO", "RU", "SK", "SL",
  "SV", "TR", "UK", "ZH-HANS", "ZH-HANT",
];

const EQUIVALENT_GROUPS: readonly (readonly string[])[] = [
  ["zh-Hans", "zh-CN", "zh"],
  ["zh-Hant", "zh-TW"],
  ["he", "iw"],
  ["jv", "jw"],
  ["fil", "tl"],
  ["no", "nb"],
  ["lg", "lug"],
  ["ny", "nya"],
  ["rn", "run"],
  ["hmn", "mww"],
  ["mni-Mtei", "mni"],
  ["sr", "sr-Cyrl"],
  ["mn", "mn-Cyrl"],
  ["fr-FR", "fr"],
  ["pt-BR", "pt"],
  ["en-US", "en"],
];

const GROUP_BY_MEMBER: ReadonlyMap<string, readonly string[]> = new Map(
  EQUIVALENT_GROUPS.flatMap((group) => {
    const members = group.map(normalizeTag);
    return members.map((member) => [member, members] as const);
  }),
);

function normalizeTag(code: string): string {
  return code.trim().toLowerCase().replace(/_/g, "-");
}

function createCatalog(codes: readonly string[], overrides: Record<string, string> = {}): ProviderCatalog {
  return { native: new Map(codes.map((code) => [normalizeTag(code), code])), overrides };
}

const GOOGLE_CATALOG = createCatalog(GOOGLE_CODES);

const CATALOGS: Readonly<Record<ProviderId, ProviderCatalog>> = {
  "google-nmt-v2": GOOGLE_CATALOG,
  "google-nmt-pa": GOOGLE_CATALOG,
  "microsoft-nmt-edge": createCatalog(MICROSOFT_CODES, { ku: "kmr", ckb: "ku" }),
  deepl: createCatalog(DEEPL_CODES),
};

function resolveProviderLanguage(provider: string, code: string): string | null {
  const catalog = CATALOGS[provider as ProviderId];
  if (!catalog) return null;
  const key = normalizeTag(code);
  const override = catalog.overrides[key];
  if (override) return override;
  for (const candidate of [key, ...(GROUP_BY_MEMBER.get(key) ?? [])]) {
    const native = catalog.native.get(candidate);
    if (native) return native;
  }
  return null;
}

export function supportedCodesFor(provider: string, candidates: readonly string[]): Set<string> {
  return new Set(candidates.filter((code) => resolveProviderLanguage(provider, code) !== null));
}
