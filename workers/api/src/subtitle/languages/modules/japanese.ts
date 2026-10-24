import { japaneseSourceRules, targetRules } from "../rules";
import { loadJapaneseCutter } from "../segmenters/japanese";
import type { LanguageFamily } from "../types";

const rules = targetRules({ defersPunctuationStyle: true, collapsesTermWhitespace: true, loadWordCutter: loadJapaneseCutter });

export const japaneseFamily: LanguageFamily = {
  codes: ["ja"],
  module: { script: "cjk", source: japaneseSourceRules, targetFor: () => rules },
};
