import { nonLatinSourceRules, targetRules } from "../rules";
import type { LanguageFamily } from "../types";

const rules = targetRules({ collapsesTermWhitespace: true });

export const koreanFamily: LanguageFamily = {
  codes: ["ko"],
  module: { script: "cjk", source: nonLatinSourceRules, targetFor: () => rules },
};
