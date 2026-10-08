import { nonLatinSourceRules, targetRules } from "../rules";
import { loadChineseCutter } from "../segmenters/chinese";
import type { LanguageFamily, TargetRules } from "../types";

const TRADITIONAL_VARIANT_PATTERN = /^zh-(?:hant|tw|hk|mo)(?![a-z])/i;

const chineseBase: Partial<TargetRules> = {
  stripsCjkTerminalPunctuation: true,
  anchorsToSourcePunctuation: true,
  collapsesTermWhitespace: true,
  readingLimits: { cps: 9, maxCharsPerLine: 16 },
};

const simplified = targetRules({ ...chineseBase, quotes: ["\u201c", "\u201d"], loadWordCutter: loadChineseCutter });
const traditional = targetRules({ ...chineseBase, quotes: ["\u300c", "\u300d"], loadWordCutter: loadChineseCutter });
const cantonese = targetRules({ ...chineseBase, quotes: ["\u300c", "\u300d"], loadWordCutter: loadChineseCutter });

export const chineseFamily: LanguageFamily = {
  codes: ["zh"],
  module: {
    script: "cjk",
    source: nonLatinSourceRules,
    targetFor: (code) => (TRADITIONAL_VARIANT_PATTERN.test(code) ? traditional : simplified),
  },
};

export const cantoneseFamily: LanguageFamily = {
  codes: ["yue"],
  module: { script: "cjk", source: nonLatinSourceRules, targetFor: () => cantonese },
};
