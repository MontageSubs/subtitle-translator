import type { WordCutter } from "../languages/types";

export type BoundaryName = "trail_off" | "comma" | "period" | "colon";

const BOUNDARY_ORDER: readonly BoundaryName[] = ["trail_off", "comma", "period", "colon"];

const BOUNDARY_CLASSIFY_PATTERNS: Record<BoundaryName, RegExp> = {
  trail_off: /(\.{2,}|-{2,}|—+|…+)\s*$/,
  comma: /[,，、]\s*$/,
  period: /[.!?！？]['"”’)\]]*\s*$/,
  colon: /[:：]\s*$/,
};

export const BOUNDARY_SEARCH_PATTERNS: Record<BoundaryName, RegExp[]> = {
  trail_off: [/\.{2,}|-{2,}|—+|…+/g],
  comma: [/[,，；;]+/g, /、+/g],
  period: [/[.。!?！？]+['"”’)\]]*/g],
  colon: [/[:：]+/g],
};

const CLOSING_TAIL_CHARS = "'\"”’)\\]}》」』】〕＞〉»›";

export const GENERAL_STRONG_PUNCT_PATTERN = new RegExp(`[，,、；;。.!?！？：:]+[${CLOSING_TAIL_CHARS}]*`, "g");
export const GENERAL_WEAK_PUNCT_PATTERN = new RegExp(`(?:\\.{2,}|—+|…+)[${CLOSING_TAIL_CHARS}]*`, "g");
export const LEFT_CUT_PATTERN = /[“「『（([{＜〈《【〔„‚«‹¿¡]/g;

export const ORIGINAL_PUNCT_TOLERANCE: Record<BoundaryName, number> = { trail_off: 0.6, comma: 0.3, period: 0.25, colon: 0.25 };
export const INFERRED_PUNCT_TOLERANCE = 0.15;
export const INFERRED_WEAK_PUNCT_TOLERANCE = 0.06;
export const PUNCT_PROXIMITY_CHARS = 8;
export const PUNCT_PROXIMITY_CHARS_WEAK = 3;
export const HARD_BREAK_PUNCT_TOLERANCE = 0.12;
export const HARD_BREAK_PROXIMITY_CHARS = 2;

const FALLBACK_BOUNDARY_PATTERN = /[，,、；;。.!?…\s]+/g;
const WHITESPACE_TOKEN_PATTERN = /\S+\s*/g;
const SPACE_PATTERN = /\s/;

export function classifyBoundary(text: string): BoundaryName | null {
  for (const name of BOUNDARY_ORDER) if (BOUNDARY_CLASSIFY_PATTERNS[name].test(text)) return name;
  return null;
}

export function collectMatchEnds(pattern: RegExp, text: string, accept: (end: number, start: number) => boolean): number[] {
  const ends: number[] = [];
  pattern.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    const end = match.index + match[0].length;
    if (accept(end, match.index)) ends.push(end);
  }
  return ends;
}

export function nearestTo(values: number[], target: number): number {
  return values.reduce((best, value) => (Math.abs(value - target) < Math.abs(best - target) ? value : best));
}

export function wordBoundaries(text: string, cutter: WordCutter | null): number[] {
  if (cutter) {
    const boundaries = [0];
    for (const word of cutter(text)) boundaries.push(boundaries[boundaries.length - 1]! + word.length);
    return boundaries.filter((b) => b === 0 || b === text.length || (text[b - 1] !== "·" && text[b] !== "·"));
  }
  if (SPACE_PATTERN.test(text)) {
    const boundaries = [0, ...[...text.matchAll(WHITESPACE_TOKEN_PATTERN)].map((m) => m.index! + m[0].length)];
    return [...new Set([...boundaries, text.length])].sort((a, b) => a - b);
  }
  const boundaries = new Set([0, text.length]);
  for (const m of text.matchAll(FALLBACK_BOUNDARY_PATTERN)) boundaries.add(m.index! + m[0].length);
  return [...boundaries].sort((a, b) => a - b);
}
