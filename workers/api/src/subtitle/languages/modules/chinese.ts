import { nonLatinSourceRules, targetRules } from "../rules";
import { loadChineseCutter } from "../segmenters/chinese";
import { isTraditionalChinese } from "../../common/languageCodes";
import type { LanguageFamily, TargetRules } from "../types";

const chineseBase: Partial<TargetRules> = {
  stripsCjkTerminalPunctuation: true,
  anchorsToSourcePunctuation: true,
  collapsesTermWhitespace: true,
};

const simplified = targetRules({ ...chineseBase, quotes: ["\u201c", "\u201d"], loadWordCutter: loadChineseCutter });
const traditional = targetRules({ ...chineseBase, quotes: ["\u300c", "\u300d"], loadWordCutter: loadChineseCutter });
const cantonese = targetRules({ ...chineseBase, quotes: ["\u300c", "\u300d"], loadWordCutter: loadChineseCutter });

export const chineseFamily: LanguageFamily = {
  codes: ["zh"],
  module: {
    script: "cjk",
    source: nonLatinSourceRules,
    targetFor: (code) => (isTraditionalChinese(code) ? traditional : simplified),
  },
};

export const cantoneseFamily: LanguageFamily = {
  codes: ["yue"],
  module: { script: "cjk", source: nonLatinSourceRules, targetFor: () => cantonese },
};
