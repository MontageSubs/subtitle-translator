import { createLineBreakPolicy } from "../shared/breakScoring";
import { createSourceRules } from "../shared/sourceRules";
import { LanguageModule, OrthographyRule, SourceRules } from "../shared/types";

export function defineLatinLanguage(code: string, rule: OrthographyRule, source: Partial<SourceRules> = {}): LanguageModule {
  return {
    id: code,
    script: "latin",
    source: createSourceRules(source),
    target: {
      lineBreak: createLineBreakPolicy(rule, { countsCharacters: false, rewardsSpaceBoundary: false }),
      assFont: "Arial",
      alignsMusicToTop: false,
    },
  };
}
