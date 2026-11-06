import { CHINESE_ORTHOGRAPHY } from "../common/chineseOrthography";
import { baseLanguage, scriptOf } from "../common/languageCodes";
import { createChineseContinuation } from "./continuation/chinese";
import type { ContinuationRule } from "./continuation/cjk";
import { continuesJapaneseSentence } from "./continuation/japanese";
import { continuesByPunctuation } from "./continuation/punctuated";

export interface SentenceRules {
  continuesSentence: ContinuationRule;
  isShortReply(text: string): boolean;
  stripLetterStutter(text: string): string;
}

const STUTTER_WORD_PATTERN = /(?<![A-Za-z])([A-Za-z])-\1(?![A-Za-z])/gi;
const STUTTER_PREFIX_PATTERN = /(?<![A-Za-z])([A-Za-z])-(?=\1[a-z])/gi;
const LATIN_SHORT_REPLY_PATTERN = /[\p{Script=Latin}\p{N}]/gu;
const SHORT_REPLY_MAX_TOKENS = 3;

const stripLatinStutter = (text: string): string => (text.includes("-") ? text.replace(STUTTER_WORD_PATTERN, "$1").replace(STUTTER_PREFIX_PATTERN, "") : text);

const latinRules: SentenceRules = {
  continuesSentence: continuesByPunctuation,
  isShortReply: (text) => (text.match(LATIN_SHORT_REPLY_PATTERN) || []).length <= SHORT_REPLY_MAX_TOKENS,
  stripLetterStutter: stripLatinStutter,
};

const nonLatinRules: SentenceRules = {
  continuesSentence: continuesByPunctuation,
  isShortReply: (text) => text.trim().length <= SHORT_REPLY_MAX_TOKENS,
  stripLetterStutter: (text) => text,
};

const mandarinRules: SentenceRules = { ...nonLatinRules, continuesSentence: createChineseContinuation(CHINESE_ORTHOGRAPHY["zh-hans"], CHINESE_ORTHOGRAPHY["zh-hant"]) };
const cantoneseRules: SentenceRules = { ...nonLatinRules, continuesSentence: createChineseContinuation(CHINESE_ORTHOGRAPHY.yue) };
const japaneseRules: SentenceRules = { ...nonLatinRules, continuesSentence: continuesJapaneseSentence };

export function sentenceRulesFor(sourceLang: string): SentenceRules {
  const base = baseLanguage(sourceLang);
  if (base === "zh") return mandarinRules;
  if (base === "yue") return cantoneseRules;
  if (base === "ja") return japaneseRules;
  return scriptOf(sourceLang) === "latin" ? latinRules : nonLatinRules;
}
