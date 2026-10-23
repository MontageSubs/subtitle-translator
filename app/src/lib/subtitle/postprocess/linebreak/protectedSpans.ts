import { MarkedText, pairedSpans } from "./inlineMarkup";

const HARD_PATTERNS: readonly RegExp[] = [
  /\.{2,}|[…‥]+/g,
  /[!?！？]{2,}[.…]*/g,
  /[—–-]{2,}|[~～]{2,}/g,
  /\d+(?:[.,:·/]\d+)+%?/g,
  /[$€£¥]\s?\d[\d.,]*|\d[\d.,]*\s?(?:%|‰|°[CF]?)/g,
  /\p{L}+(?:[·•‧]\p{L}+)+/gu,
  /(?:https?:\/\/|www\.)\S+|[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g,
  /[#@][\p{L}\p{N}_]+/gu,
  /《[^《》]{1,16}》/g,
];

const PAIR_PATTERNS: readonly RegExp[] = [
  /“[^“”]*”|‘[^‘’]*’|「[^「」]*」|『[^『』]*』|《[^《》]*》|（[^（）]*）|【[^【】]*】|„[^„“”]*[“”]|«[^«»]*»|‹[^‹›]*›/g,
  /\([^()]*\)|\[[^\[\]]*\]|"[^"]*"/g,
];

const STYLE_SPAN_PENALTY = 45;
const PAIR_SPAN_PENALTY = 40;
const PAIR_HARD_MAX_CHARS = 8;

export interface Protection {
  forbids(position: number): boolean;
  penaltyAt(position: number): number;
}

type Range = [number, number];

function matchRanges(text: string, patterns: readonly RegExp[]): Range[] {
  return patterns.flatMap((pattern) => Array.from(text.matchAll(pattern), (match): Range => [match.index!, match.index! + match[0].length]));
}

const strictlyInside = (ranges: readonly Range[], position: number): boolean => ranges.some(([start, end]) => start < position && position < end);

export function buildProtection(marked: MarkedText): Protection {
  const { visible } = marked;
  const pairs = matchRanges(visible, PAIR_PATTERNS);
  const hard = [...matchRanges(visible, HARD_PATTERNS), ...pairs.filter(([start, end]) => end - start <= PAIR_HARD_MAX_CHARS)];
  const styled = pairedSpans(marked);
  return {
    forbids: (position) => strictlyInside(hard, position),
    penaltyAt: (position) => (strictlyInside(styled, position) ? STYLE_SPAN_PENALTY : 0) + (strictlyInside(pairs, position) ? PAIR_SPAN_PENALTY : 0),
  };
}
