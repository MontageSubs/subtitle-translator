import { createLineBreakPolicy } from "../shared/breakScoring";
import { createSourceRules } from "../shared/sourceRules";
import { LanguageModule, OrthographyRule, SourceRules } from "../shared/types";

export const LATIN_SCRIPT_CODES: ReadonlySet<string> = new Set([
  "en", "es", "fr", "de", "it", "pt", "nl", "pl", "sv", "da", "no", "nb", "fi", "ro",
  "cs", "hu", "tr", "id", "vi", "ms", "tl", "fil", "ca", "eu", "gl", "la", "hr", "sk",
  "sl", "lt", "lv", "et", "sq", "cy", "is", "af",
]);

export function defineLatinLanguage(code: string, rule: OrthographyRule, source: Partial<SourceRules> = {}): LanguageModule {
  return {
    id: code,
    script: "latin",
    source: createSourceRules(source),
    target: {
      reading: { maxCharsPerLine: 42, speedCps: 20 },
      lineBreak: createLineBreakPolicy(rule, { countsCharacters: false, rewardsSpaceBoundary: false }),
      assFont: "Arial",
      alignsMusicToTop: false,
    },
  };
}
