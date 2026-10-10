import { nonLatinSourceRules, targetRules } from "../rules";
import { loadChineseCutter } from "../segmenters/chinese";
import { CHINESE_ORTHOGRAPHY, type ChineseOrthography } from "../../common/chineseOrthography";
import { languageKey } from "../../common/languageCodes";
import type { BreakRule, LanguageFamily, TargetRules } from "../types";

const chineseBase: Partial<TargetRules> = {
  stripsCjkTerminalPunctuation: true,
  anchorsToSourcePunctuation: true,
  collapsesTermWhitespace: true,
};

const breakRuleOf = ({ proclitics, enclitics, conjunctions }: ChineseOrthography): BreakRule => ({
  noCueStart: new Set(enclitics),
  noCueEnd: new Set([...proclitics, ...conjunctions]),
});

const simplified = targetRules({ ...chineseBase, quotes: ["\u201c", "\u201d"], breakRule: breakRuleOf(CHINESE_ORTHOGRAPHY["zh-hans"]), loadWordCutter: loadChineseCutter });
const traditional = targetRules({ ...chineseBase, quotes: ["\u300c", "\u300d"], breakRule: breakRuleOf(CHINESE_ORTHOGRAPHY["zh-hant"]), loadWordCutter: loadChineseCutter });
const cantonese = targetRules({ ...chineseBase, quotes: ["\u300c", "\u300d"], breakRule: breakRuleOf(CHINESE_ORTHOGRAPHY.yue), loadWordCutter: loadChineseCutter });

export const chineseFamily: LanguageFamily = {
  codes: ["zh"],
  module: {
    script: "cjk",
    source: nonLatinSourceRules,
    targetFor: (code) => (languageKey(code) === "zh-hant" ? traditional : simplified),
  },
};

export const cantoneseFamily: LanguageFamily = {
  codes: ["yue"],
  module: { script: "cjk", source: nonLatinSourceRules, targetFor: () => cantonese },
};
