import { OrthographyRule } from "./types";
import { getLanguageRule, preloadLanguageRule } from "./registry";

export type LineBreakRule = OrthographyRule;

export function languageBreakRule(code: string): LineBreakRule {
  return getLanguageRule(code);
}

export { preloadLanguageRule };
