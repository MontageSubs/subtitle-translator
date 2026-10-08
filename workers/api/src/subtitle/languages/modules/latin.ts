import { latinSourceRules, targetRules } from "../rules";
import type { LanguageFamily } from "../types";

const rules = targetRules();

export const latinFamily: LanguageFamily = {
  codes: [
    "en", "es", "fr", "de", "it", "pt", "nl", "pl", "sv", "da", "no", "fi", "ro", "cs", "hu", "tr",
    "id", "vi", "ms", "tl", "ca", "eu", "gl",
  ],
  module: { script: "latin", source: latinSourceRules, targetFor: () => rules },
};

export const classicalLatinFamily: LanguageFamily = {
  codes: ["la"],
  module: { script: "latin", source: { ...latinSourceRules, usesLatinPunctuation: false }, targetFor: () => rules },
};
