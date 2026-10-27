import { isInsideAny, letterCount, WORD_BOUNDARY, wordCount, type EntityLanguageRules, type NameCandidate } from "./shared";

const WORD_PATTERN = /\p{L}[\p{L}\p{M}]*/gu;
const SENTENCE_BREAK_PATTERN = /[.!?…]/;
const MIN_TOKEN_LETTERS = 2;
const MAX_NAME_WORDS = 5;

const startsUppercase = (token: string): boolean => token[0] !== token[0].toLowerCase();

export const casedRules: EntityLanguageRules = {
  id: "cased",
  cueJoiner: " ",
  maxUnitChars: 360,
  lockBoundary: WORD_BOUNDARY,
  buildLexicon(units) {
    const lowercase = new Set<string>();
    for (const unit of units) for (const [token] of unit.matchAll(WORD_PATTERN)) if (token.length >= MIN_TOKEN_LETTERS && token === token.toLowerCase()) lowercase.add(token);
    return lowercase;
  },
  findCandidates(unit, covered, lexicon) {
    const candidates: NameCandidate[] = [];
    let previousEnd = 0;
    let first = true;
    for (const match of unit.matchAll(WORD_PATTERN)) {
      const token = match[0];
      const start = match.index!;
      const end = start + token.length;
      const initial = first || SENTENCE_BREAK_PATTERN.test(unit.slice(previousEnd, start));
      first = false;
      previousEnd = end;
      if (token.length < MIN_TOKEN_LETTERS || !startsUppercase(token)) continue;
      const lower = token.toLowerCase();
      if ((initial || token === token.toUpperCase()) && lexicon.has(lower)) continue;
      if (isInsideAny({ start, end }, covered)) continue;
      candidates.push({ start, end, key: lower });
    }
    return candidates;
  },
  isPlausibleName: (surface) => letterCount(surface) >= MIN_TOKEN_LETTERS && wordCount(surface) <= MAX_NAME_WORDS && startsUppercase(surface.match(/\p{L}/u)?.[0] ?? "a"),
};
