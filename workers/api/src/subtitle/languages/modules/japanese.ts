import { nonLatinSourceRules, targetRules } from "../rules";
import { loadJapaneseCutter } from "../segmenters/japanese";
import type { LanguageFamily } from "../types";

const rules = targetRules({ collapsesTermWhitespace: true, loadWordCutter: loadJapaneseCutter });

export const japaneseFamily: LanguageFamily = {
  codes: ["ja"],
  module: { script: "cjk", source: nonLatinSourceRules, targetFor: () => rules },
};
