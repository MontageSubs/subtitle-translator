import { createLineBreakPolicy } from "../shared/breakScoring";
import { createSourceRules } from "../shared/sourceRules";
import { LanguageModule, OrthographyRule } from "../shared/types";

export const ARABIC_SCRIPT_NO_LINE_START: readonly string[] = ["،", "؛", "؟", "٪", "٫", "٬"];

export function defineArabicScriptLanguage(code: string, rule: OrthographyRule): LanguageModule {
  return {
    id: code,
    script: "arabic",
    source: createSourceRules(),
    target: {
      lineBreak: createLineBreakPolicy(rule, { countsCharacters: false, rewardsSpaceBoundary: false }),
      alignsMusicToTop: false,
    },
  };
}
