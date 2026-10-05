import { BreakCandidate, LineBreakPolicy, OrthographyRule } from "./types";

export interface BreakScoringOptions {
  countsCharacters: boolean;
  rewardsSpaceBoundary: boolean;
}

const CLOSERS = `['"”’»›」』）\\)\\}\\]】]*`;
const TERMINAL_PUNCT_PATTERN = new RegExp(`(?:\\.{2,}|[.…‥。۔?!？！؟‽])${CLOSERS}$`, "u");
const CLAUSE_PUNCT_PATTERN = new RegExp(`[:;：；؛—–]${CLOSERS}$`, "u");
const MINOR_PUNCT_PATTERN = new RegExp(`[,，、،]${CLOSERS}$`, "u");
const ABBREVIATION_PATTERN = new RegExp(
  `(?:^|\\s)(?:[A-Za-z]{1,3}\\.|[A-Z][a-z]{1,4}\\.|etc\\.|vs\\.|e\\.g\\.|i\\.e\\.|approx\\.|dept\\.|fig\\.|gen\\.|gov\\.|inc\\.|jr\\.|sr\\.|ltd\\.|st\\.|vol\\.)${CLOSERS}$`,
  "i"
);
const NUMBER_TAIL_PATTERN = /\d+$/;
const UNIT_HEAD_PATTERN = /^(%|‰|[a-zA-Z]{1,4}|[\p{Script=Han}])/u;
const SINGLE_LETTER_PATTERN = /^\p{L}$/u;

const UNBALANCED_RATIO = 1.35;
const UNBALANCED_PENALTY = 15;
const CLITIC_PENALTY = 70;
const ORPHAN_LETTER_PENALTY = 60;
const NUMBER_UNIT_PENALTY = 60;
const SHORT_LINE_PENALTY = 75;
const CJK_TINY_LINE_PENALTY = 150;
const CJK_SHORT_LINE_SOFT_PENALTY = 20;
const TERMINAL_REWARD = 95;
const CLAUSE_REWARD = 50;
const MINOR_REWARD = 30;
const SPACE_BOUNDARY_REWARD = 65;
const CONJUNCTION_REWARD = 25;

function countUnits(text: string, countsCharacters: boolean): number {
  const pattern = countsCharacters ? /[\p{L}\p{N}]/gu : /[\p{L}\p{N}]+/gu;
  return text.match(pattern)?.length ?? 0;
}

function shortLinePenalty(candidate: BreakCandidate, options: BreakScoringOptions, softened: boolean): number {
  const { line1, line2 } = candidate;
  const units1 = countUnits(line1, options.countsCharacters);
  const units2 = countUnits(line2, options.countsCharacters);
  if (options.countsCharacters) {
    if (units1 < 2 || units2 < 2) return CJK_TINY_LINE_PENALTY;
    if (units1 < 3 || units2 < 3) return softened ? CJK_SHORT_LINE_SOFT_PENALTY : SHORT_LINE_PENALTY;
    return 0;
  }
  return units1 <= 1 || line1.length < 4 || units2 <= 1 || line2.length < 4 ? SHORT_LINE_PENALTY : 0;
}

function punctuationReward(line1: string, terminal: boolean, spaceBoundary: boolean): number {
  if (terminal) return TERMINAL_REWARD;
  if (CLAUSE_PUNCT_PATTERN.test(line1)) return CLAUSE_REWARD;
  if (MINOR_PUNCT_PATTERN.test(line1)) return MINOR_REWARD;
  return spaceBoundary ? SPACE_BOUNDARY_REWARD : 0;
}

export function createLineBreakPolicy(rule: OrthographyRule, options: BreakScoringOptions): LineBreakPolicy {
  return {
    rule,
    score(candidate) {
      const { offset, totalLength, line1, line2, lastWord, nextWord } = candidate;
      const spaceBoundary = options.rewardsSpaceBoundary && candidate.isSpaceBoundary;
      const terminal = TERMINAL_PUNCT_PATTERN.test(line1) && !ABBREVIATION_PATTERN.test(line1);

      let score = Math.abs(offset - totalLength / 2) + Math.abs(line1.length - line2.length) * 0.5;
      if (!terminal && !spaceBoundary && line1.length > line2.length * UNBALANCED_RATIO) score += UNBALANCED_PENALTY;
      if (rule.proclitics.has(lastWord)) score += CLITIC_PENALTY;
      if (!options.countsCharacters && lastWord.length === 1 && SINGLE_LETTER_PATTERN.test(lastWord)) score += ORPHAN_LETTER_PENALTY;
      if (rule.enclitics.has(nextWord)) score += CLITIC_PENALTY;
      if (NUMBER_TAIL_PATTERN.test(line1) && UNIT_HEAD_PATTERN.test(nextWord)) score += NUMBER_UNIT_PENALTY;
      score += shortLinePenalty(candidate, options, terminal || spaceBoundary);
      score -= punctuationReward(line1, terminal, spaceBoundary);
      if (rule.conjunctions.has(nextWord)) score -= CONJUNCTION_REWARD;
      return score;
    },
  };
}
