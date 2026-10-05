import { createLineBreakPolicy } from "../shared/breakScoring";
import { LanguageModule, OrthographyRule } from "../shared/types";

export function defineKoreanLanguage(code: "ko", rule: OrthographyRule): LanguageModule {
  return {
    id: code,
    baseCode: code,
    script: "cjk",
    reading: { maxCharsPerLine: 18, speedCps: 9 },
    bilingualWithChineseByDefault: false,
    assFont: "Malgun Gothic",
    lineBreak: createLineBreakPolicy(rule, { countsCharacters: true, rewardsSpaceBoundary: false }),
  };
}
