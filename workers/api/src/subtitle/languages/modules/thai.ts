import { nonLatinSourceRules, targetRules } from "../rules";
import type { LanguageFamily } from "../types";

const rules = targetRules();

export const thaiFamily: LanguageFamily = {
  codes: ["th"],
  module: { script: "thai", source: nonLatinSourceRules, targetFor: () => rules },
};
