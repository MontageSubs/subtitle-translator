import { createLineBreakPolicy } from "../shared/breakScoring";
import { LanguageModule, OrthographyRule } from "../shared/types";

export function defineCyrillicLanguage(code: string, rule: OrthographyRule): LanguageModule {
  return {
    id: code,
    baseCode: code,
    script: "cyrillic",
    reading: { maxCharsPerLine: 42, speedCps: 17 },
    bilingualWithChineseByDefault: false,
    assFont: "Arial",
    lineBreak: createLineBreakPolicy(rule, { countsCharacters: false, rewardsSpaceBoundary: false }),
  };
}
