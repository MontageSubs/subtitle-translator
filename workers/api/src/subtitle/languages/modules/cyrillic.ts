import { nonLatinSourceRules, targetRules } from "../rules";
import type { LanguageFamily } from "../types";

const rules = targetRules();

export const cyrillicFamily: LanguageFamily = {
  codes: ["ru", "uk", "bg"],
  module: { script: "cyrillic", source: nonLatinSourceRules, targetFor: () => rules },
};
