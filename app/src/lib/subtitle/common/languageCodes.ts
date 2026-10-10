export type Script = "latin" | "cjk" | "cyrillic" | "arabic" | "devanagari" | "hebrew" | "greek" | "thai";

const SCRIPT_LANGUAGES: Record<Script, readonly string[]> = {
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

const ALIASES: Record<string, string> = { cantonese: "yue", iw: "he", in: "id", nb: "no", nn: "no", fil: "tl" };
const TRADITIONAL_REGIONS: ReadonlySet<string> = new Set(["tw", "hk", "mo"]);

const SCRIPT_BY_LANGUAGE: ReadonlyMap<string, Script> = new Map(
  (Object.entries(SCRIPT_LANGUAGES) as [Script, readonly string[]][]).flatMap(([script, codes]) => codes.map((code) => [code, script] as const)),
);

export function languageKey(code: string | null | undefined): string {
  const [language = "", ...subtags] = (code ?? "").trim().toLowerCase().replace(/_/g, "-").split("-");
  if (language !== "zh") return ALIASES[language] ?? language;
  if (subtags.includes("hant")) return "zh-hant";
  if (subtags.includes("hans")) return "zh-hans";
  return subtags.some((subtag) => TRADITIONAL_REGIONS.has(subtag)) ? "zh-hant" : "zh-hans";
}

export const baseLanguage = (code: string | null | undefined): string => languageKey(code).split("-")[0]!;

export const isTraditionalChinese = (code: string | null | undefined): boolean => languageKey(code) === "zh-hant";

export const scriptOf = (code: string | null | undefined): Script | undefined => SCRIPT_BY_LANGUAGE.get(baseLanguage(code));

export const languagesOfScript = (script: Script): readonly string[] => SCRIPT_LANGUAGES[script];
