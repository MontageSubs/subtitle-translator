import { createLineBreakPolicy } from "../shared/breakScoring";
import { UNIVERSAL_ORTHOGRAPHY } from "../shared/orthography";
import { LanguageModule } from "../shared/types";

export function defineUnlistedLanguage(code: string): LanguageModule {
  return {
    id: code,
    baseCode: code,
    script: "other",
    reading: { maxCharsPerLine: 42, speedCps: 17 },
    bilingualWithChineseByDefault: false,
    assFont: "Arial",
    lineBreak: createLineBreakPolicy(UNIVERSAL_ORTHOGRAPHY, { countsCharacters: false, rewardsSpaceBoundary: false }),
  };
}
