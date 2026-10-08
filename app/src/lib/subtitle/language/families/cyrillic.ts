import { createLineBreakPolicy } from "../shared/breakScoring";
import { createSourceRules } from "../shared/sourceRules";
import { LanguageModule, OrthographyRule } from "../shared/types";

export function defineCyrillicLanguage(code: string, rule: OrthographyRule): LanguageModule {
  return {
    id: code,
    script: "cyrillic",
    source: createSourceRules(),
    target: {
      reading: { maxCharsPerLine: 42, speedCps: 17 },
      lineBreak: createLineBreakPolicy(rule, { countsCharacters: false, rewardsSpaceBoundary: false }),
      assFont: "Arial",
      alignsMusicToTop: false,
    },
  };
}
