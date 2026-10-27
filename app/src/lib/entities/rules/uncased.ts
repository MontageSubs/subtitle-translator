import { isInsideAny, letterCount, WORD_BOUNDARY, wordCount, type EntityLanguageRules, type NameCandidate } from "./shared";

const WORD_PATTERN = /\p{L}[\p{L}\p{M}]*/gu;
const MIN_TOKEN_LETTERS = 2;
const MAX_NAME_WORDS = 5;

export const uncasedRules: EntityLanguageRules = {
  id: "uncased",
  cueJoiner: " ",
  maxUnitChars: 360,
  lockBoundary: WORD_BOUNDARY,
  buildLexicon: () => new Set<string>(),
  findCandidates(unit, covered) {
    const candidates: NameCandidate[] = [];
    for (const match of unit.matchAll(WORD_PATTERN)) {
      const token = match[0];
      const start = match.index!;
      const range = { start, end: start + token.length };
      if (token.length >= MIN_TOKEN_LETTERS && !isInsideAny(range, covered)) candidates.push({ ...range, key: token.toLowerCase() });
    }
    return candidates;
  },
  isPlausibleName: (surface) => letterCount(surface) >= MIN_TOKEN_LETTERS && wordCount(surface) <= MAX_NAME_WORDS,
};
