import { nonLatinSourceRules, targetRules } from "../rules";
import type { LanguageFamily } from "../types";

const rules = targetRules();

export const greekFamily: LanguageFamily = {
  codes: ["el"],
  module: { script: "greek", source: nonLatinSourceRules, targetFor: () => rules },
};
