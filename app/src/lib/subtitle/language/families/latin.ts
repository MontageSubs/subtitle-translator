import { createLineBreakPolicy } from "../shared/breakScoring";
import { LanguageModule, OrthographyRule } from "../shared/types";

export const LATIN_SCRIPT_CODES: ReadonlySet<string> = new Set([
  "en", "es", "fr", "de", "it", "pt", "nl", "pl", "sv", "da", "no", "nb", "fi", "ro",
  "cs", "hu", "tr", "id", "vi", "ms", "tl", "fil", "ca", "eu", "gl", "la", "hr", "sk",
  "sl", "lt", "lv", "et", "sq", "cy", "is", "af",
]);

export function defineLatinLanguage(code: string, rule: OrthographyRule): LanguageModule {
  return {
    id: code,
    baseCode: code,
    script: "latin",
    reading: { maxCharsPerLine: 42, speedCps: 20 },
    bilingualWithChineseByDefault: code === "en",
    assFont: "Arial",
    lineBreak: createLineBreakPolicy(rule, { countsCharacters: false, rewardsSpaceBoundary: false }),
  };
}
