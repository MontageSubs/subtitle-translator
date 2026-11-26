export type Script = "latin" | "cjk" | "cyrillic" | "arabic" | "devanagari" | "hebrew" | "greek" | "thai";

export const SCRIPT_LANGUAGES: Record<Script, readonly string[]> = {
  latin: [
    "en", "es", "fr", "de", "it", "pt", "nl", "pl", "sv", "da", "no", "fi", "ro", "cs", "hu", "tr", "id", "vi",
    "ms", "tl", "ca", "eu", "gl", "la", "hr", "sk", "sl", "lt", "lv", "et", "sq", "cy", "is", "af",
  ],
  cjk: ["zh", "yue", "ja", "ko"],
  cyrillic: ["ru", "uk", "bg"],
  arabic: ["ar", "fa", "ur"],
  devanagari: ["hi", "ne", "mr"],
  hebrew: ["he"],
  greek: ["el"],
  thai: ["th"],
};

const ALIASES: Record<string, string> = { cantonese: "yue", lzh: "zh-hant", iw: "he", in: "id", nb: "no", nn: "no", fil: "tl" };
const TRADITIONAL_REGIONS: ReadonlySet<string> = new Set(["tw", "hk", "mo"]);

const SCRIPT_BY_LANGUAGE: ReadonlyMap<string, Script> = new Map(
  (Object.entries(SCRIPT_LANGUAGES) as [Script, readonly string[]][]).flatMap(([script, codes]) => codes.map((code) => [code, script] as const)),
);

const MAX_CACHED_KEYS = 256;
const keyCache = new Map<string, string>();

function resolveLanguageKey(code: string): string {
  const [language = "", ...subtags] = code.trim().toLowerCase().replace(/_/g, "-").split("-");
  if (language !== "zh") return ALIASES[language] ?? language;
  if (subtags.includes("hant")) return "zh-hant";
  if (subtags.includes("hans")) return "zh-hans";
  return subtags.some((subtag) => TRADITIONAL_REGIONS.has(subtag)) ? "zh-hant" : "zh-hans";
}

export function languageKey(code: string | null | undefined): string {
  const raw = code ?? "";
  let key = keyCache.get(raw);
  if (key === undefined) {
    key = resolveLanguageKey(raw);
    if (keyCache.size < MAX_CACHED_KEYS) keyCache.set(raw, key);
  }
  return key;
}

export const baseLanguage = (code: string | null | undefined): string => {
  const key = languageKey(code);
  const dash = key.indexOf("-");
  return dash < 0 ? key : key.slice(0, dash);
};

export const isChineseLanguage = (code: string | null | undefined): boolean => {
  const base = baseLanguage(code);
  return base === "zh" || base === "yue";
};

const SCRIPT_BY_SUBTAG: ReadonlyMap<string, Script> = new Map([
  ["latn", "latin"], ["cyrl", "cyrillic"], ["arab", "arabic"], ["deva", "devanagari"], ["hebr", "hebrew"], ["grek", "greek"], ["thai", "thai"],
]);
const scriptCache = new Map<string, Script | undefined>();

function resolveScript(code: string): Script | undefined {
  const [, ...subtags] = code.trim().toLowerCase().replace(/_/g, "-").split("-");
  for (const subtag of subtags) {
    const script = SCRIPT_BY_SUBTAG.get(subtag);
    if (script) return script;
  }
  return SCRIPT_BY_LANGUAGE.get(baseLanguage(code));
}

export function scriptOf(code: string | null | undefined): Script | undefined {
  const raw = code ?? "";
  if (scriptCache.has(raw)) return scriptCache.get(raw);
  const script = resolveScript(raw);
  if (scriptCache.size < MAX_CACHED_KEYS) scriptCache.set(raw, script);
  return script;
}

export function scriptVariantKey(code: string | null | undefined): string {
  const key = languageKey(code);
  const script = scriptOf(code);
  return script !== undefined && script !== SCRIPT_BY_LANGUAGE.get(baseLanguage(code)) ? `${key}-${script}` : key;
}

const RIGHT_TO_LEFT_LANGUAGES: ReadonlySet<string> = new Set(["ar", "fa", "prs", "he", "yi", "ur", "ps", "sd", "ug", "ckb", "ks", "dv", "syr", "nqo"]);
const RIGHT_TO_LEFT_SCRIPT_SUBTAGS: ReadonlySet<string> = new Set(["arab", "hebr", "thaa", "syrc", "nkoo", "adlm"]);

export function isRightToLeftLanguage(code: string | null | undefined): boolean {
  const [language = "", ...subtags] = (code ?? "").trim().toLowerCase().replace(/_/g, "-").split("-");
  return RIGHT_TO_LEFT_LANGUAGES.has(ALIASES[language] ?? language) || subtags.some((subtag) => RIGHT_TO_LEFT_SCRIPT_SUBTAGS.has(subtag));
}
