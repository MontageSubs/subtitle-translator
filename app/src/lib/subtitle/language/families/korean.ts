import { createLineBreakPolicy } from "../shared/breakScoring";
import { createSourceRules } from "../shared/sourceRules";
import { LanguageModule, OrthographyRule } from "../shared/types";

export function defineKoreanLanguage(code: "ko", rule: OrthographyRule): LanguageModule {
  return {
    id: code,
    script: "cjk",
    source: createSourceRules(),
    target: {
      reading: { maxCharsPerLine: 18, speedCps: 9 },
      lineBreak: createLineBreakPolicy(rule, { countsCharacters: true, rewardsSpaceBoundary: false }),
      assFont: "Malgun Gothic",
      alignsMusicToTop: true,
    },
  };
}
