import { nonLatinSourceRules, targetRules } from "../rules";
import type { LanguageFamily } from "../types";

const rules = targetRules();

export const arabicFamily: LanguageFamily = {
  codes: ["ar", "fa", "ur"],
  module: { script: "arabic", source: nonLatinSourceRules, targetFor: () => rules },
};
