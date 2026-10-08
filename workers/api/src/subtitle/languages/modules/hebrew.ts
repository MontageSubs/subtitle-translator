import { nonLatinSourceRules, targetRules } from "../rules";
import type { LanguageFamily } from "../types";

const rules = targetRules();

export const hebrewFamily: LanguageFamily = {
  codes: ["he"],
  module: { script: "hebrew", source: nonLatinSourceRules, targetFor: () => rules },
};
