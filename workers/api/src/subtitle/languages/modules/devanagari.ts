import { nonLatinSourceRules, targetRules } from "../rules";
import type { LanguageFamily } from "../types";

const rules = targetRules();

export const devanagariFamily: LanguageFamily = {
  codes: ["hi", "ne", "mr"],
  module: { script: "devanagari", source: nonLatinSourceRules, targetFor: () => rules },
};
