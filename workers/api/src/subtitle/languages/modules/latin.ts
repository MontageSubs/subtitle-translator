import { SCRIPT_LANGUAGES } from "../../common/languageCodes";
import { latinSourceRules, targetRules } from "../rules";
import type { LanguageFamily } from "../types";

const rules = targetRules();

export const latinFamily: LanguageFamily = {
  codes: SCRIPT_LANGUAGES.latin.filter((code) => code !== "la"),
  module: { script: "latin", source: latinSourceRules, targetFor: () => rules },
};

export const classicalLatinFamily: LanguageFamily = {
  codes: ["la"],
  module: { script: "latin", source: { ...latinSourceRules, usesLatinPunctuation: false }, targetFor: () => rules },
};
