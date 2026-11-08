import { continuesJapaneseSentence } from "./continuation/japanese";
import { continuesByPunctuation } from "./continuation/punctuated";
import { HEAD_LOWER } from "../extract/edges";
import type { CueEdges } from "../extract/edges";
import type { SourceRules, TargetRules } from "./types";

const STUTTER_WORD_PATTERN = /(?<![A-Za-z])([A-Za-z])-\1(?![A-Za-z])/gi;
const STUTTER_PREFIX_PATTERN = /(?<![A-Za-z])([A-Za-z])-(?=\1[a-z])/gi;
const SHORT_REPLY_TOKEN_PATTERN = /[\p{Script=Latin}\p{N}]/gu;
const WORD_TOKEN_PATTERN = /\p{Script=Latin}+(?:['’]\p{Script=Latin}+)*/gu;
const LATIN_LETTER_PATTERN = /\p{Script=Latin}/u;
const SHORT_REPLY_MAX_TOKENS = 3;
const ISOLATED_MAX_CHARS_NON_LATIN = 4;
const CAPTION_MAX_WORDS = 3;
const TAIL_PUNCTUATION_MASK = 0x3f ^ 16;

function isUnpunctuatedCaption(edges: CueEdges): boolean {
  if ((edges.tail & TAIL_PUNCTUATION_MASK) !== 0) return false;
  const text = edges.text;
  const words = text.match(WORD_TOKEN_PATTERN);
  return words !== null && words.length <= CAPTION_MAX_WORDS && text === text.toUpperCase() && text !== text.toLowerCase();
}

function continuesLatinSentence(previous: CueEdges, current: CueEdges, gapMs: number): boolean {
  if (isUnpunctuatedCaption(previous) && !(current.head & HEAD_LOWER)) return false;
  return continuesByPunctuation(previous, current, gapMs);
}

export const latinSourceRules: SourceRules = {
  usesLatinPunctuation: true,
  resolvesGlossaryStutter: true,
  stripLetterStutter: (text) => (text.includes("-") ? text.replace(STUTTER_WORD_PATTERN, "$1").replace(STUTTER_PREFIX_PATTERN, "") : text),
  hasResidualText: (text) => LATIN_LETTER_PATTERN.test(text),
  isShortReply: (text) => (text.match(SHORT_REPLY_TOKEN_PATTERN) || []).length <= SHORT_REPLY_MAX_TOKENS,
  isIsolatedShort: (text, maxWords) => Boolean(maxWords) && (text.match(WORD_TOKEN_PATTERN) || []).length <= maxWords,
  continuesSentence: continuesLatinSentence,
};

export const nonLatinSourceRules: SourceRules = {
  usesLatinPunctuation: false,
  resolvesGlossaryStutter: false,
  stripLetterStutter: (text) => text,
  hasResidualText: (text) => Boolean(text.trim()),
  isShortReply: (text) => text.trim().length <= SHORT_REPLY_MAX_TOKENS,
  isIsolatedShort: (text, maxWords) => Boolean(maxWords) && text.trim().length <= ISOLATED_MAX_CHARS_NON_LATIN,
  continuesSentence: continuesByPunctuation,
};

export const japaneseSourceRules: SourceRules = { ...nonLatinSourceRules, continuesSentence: continuesJapaneseSentence };

export function targetRules(overrides: Partial<TargetRules> = {}): TargetRules {
  return {
    quotes: null,
    defersPunctuationStyle: false,
    anchorsToSourcePunctuation: false,
    collapsesTermWhitespace: false,
    spacesBeforeFinalPunctuation: false,
    spaceSeparatesClauses: false,
    ...overrides,
  };
}
