import type { SourceRules, TargetRules } from "./types";

const STUTTER_WORD_PATTERN = /(?<![A-Za-z])([A-Za-z])-\1(?![A-Za-z])/gi;
const STUTTER_PREFIX_PATTERN = /(?<![A-Za-z])([A-Za-z])-(?=\1[a-z])/gi;
const SHORT_REPLY_TOKEN_PATTERN = /[A-Za-z0-9]/g;
const WORD_TOKEN_PATTERN = /[A-Za-z]+(?:['’][A-Za-z]+)*/g;
const LATIN_LETTER_PATTERN = /[A-Za-z]/;
const SHORT_REPLY_MAX_TOKENS = 3;
const ISOLATED_MAX_CHARS_NON_LATIN = 4;

export const latinSourceRules: SourceRules = {
  usesLatinPunctuation: true,
  resolvesGlossaryStutter: true,
  stripLetterStutter: (text) => (text.includes("-") ? text.replace(STUTTER_WORD_PATTERN, "$1").replace(STUTTER_PREFIX_PATTERN, "") : text),
  hasResidualText: (text) => LATIN_LETTER_PATTERN.test(text),
  isShortReply: (text) => (text.match(SHORT_REPLY_TOKEN_PATTERN) || []).length <= SHORT_REPLY_MAX_TOKENS,
  isIsolatedShort: (text, maxWords) => Boolean(maxWords) && (text.match(WORD_TOKEN_PATTERN) || []).length <= maxWords,
};

export const nonLatinSourceRules: SourceRules = {
  usesLatinPunctuation: false,
  resolvesGlossaryStutter: false,
  stripLetterStutter: (text) => text,
  hasResidualText: (text) => Boolean(text.trim()),
  isShortReply: (text) => text.trim().length <= SHORT_REPLY_MAX_TOKENS,
  isIsolatedShort: (text, maxWords) => Boolean(maxWords) && text.trim().length <= ISOLATED_MAX_CHARS_NON_LATIN,
};

export function targetRules(overrides: Partial<TargetRules> = {}): TargetRules {
  return {
    quotes: null,
    stripsCjkTerminalPunctuation: false,
    anchorsToSourcePunctuation: false,
    collapsesTermWhitespace: false,
    ...overrides,
  };
}
