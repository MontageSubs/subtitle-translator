import type { BreakRule, WordCutter } from "../languages/types";

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
export const HARD_BREAK_PUNCT_TOLERANCE = 0.25;
export const HARD_BREAK_PROXIMITY_CHARS = 4;

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

export type BoundaryFinder = (text: string) => number[];

const NAME_JOINERS: ReadonlySet<string> = new Set(["·", "•", "‧"]);
const LONG_NAME_CHARS = 10;

const isBlank = (piece: string): boolean => !piece.trim();

function dottedNameRuns(pieces: readonly string[]): [number, number][] {
  const starts: number[] = [];
  let at = 0;
  for (const piece of pieces) {
    starts.push(at);
    at += piece.length;
  }
  const runs: [number, number][] = [];
  let index = 1;
  while (index + 1 < pieces.length) {
    if (!NAME_JOINERS.has(pieces[index]!)) {
      index++;
      continue;
    }
    let last = index + 1;
    while (NAME_JOINERS.has(pieces[last + 1] ?? "") && last + 2 < pieces.length) last += 2;
    runs.push([starts[index - 1]!, starts[last]! + pieces[last]!.length]);
    index = last + 1;
  }
  return runs;
}

function neighbours(pieces: readonly string[]): { before: (string | undefined)[]; after: (string | undefined)[] } {
  const before: (string | undefined)[] = [];
  const after: (string | undefined)[] = new Array(pieces.length);
  let last: string | undefined;
  pieces.forEach((piece, i) => {
    if (!isBlank(piece)) last = piece;
    before.push(last);
  });
  let next: string | undefined;
  for (let i = pieces.length - 1; i >= 0; i--) {
    after[i] = next;
    if (!isBlank(pieces[i]!)) next = pieces[i];
  }
  return { before, after };
}

function allowedBoundaries(pieces: readonly string[], rule: BreakRule | null, textLength: number): number[] {
  const runs = rule ? dottedNameRuns(pieces) : [];
  const sealed = runs.filter(([start, end]) => end - start <= LONG_NAME_CHARS);
  const long = runs.filter(([start, end]) => end - start > LONG_NAME_CHARS);
  const insideName = (position: number) => sealed.some(([start, end]) => position > start && position < end);
  const insideLongName = (position: number) => long.some(([start, end]) => position > start && position < end);
  const { before, after } = neighbours(pieces);
  const open: { position: number; index: number }[] = [];
  let at = 0;
  pieces.forEach((piece, index) => {
    at += piece.length;
    const afterJoiner = NAME_JOINERS.has(piece);
    if (at < textLength && !insideName(at) && (afterJoiner || !insideLongName(at))) open.push({ position: at, index });
  });
  const ruled = rule
    ? open.filter(({ index }) => !rule.noCueEnd.has(before[index] ?? "") && !rule.noCueStart.has(after[index] ?? ""))
    : open;
  return (ruled.length ? ruled : open).map(({ position }) => position);
}

export function createBoundaryFinder(cutter: WordCutter | null, rule: BreakRule | null): BoundaryFinder {
  return (text) => {
    if (cutter) return [0, ...allowedBoundaries(cutter(text), rule, text.length), text.length];
    if (SPACE_PATTERN.test(text)) {
      const boundaries = [0, ...[...text.matchAll(WHITESPACE_TOKEN_PATTERN)].map((m) => m.index! + m[0].length)];
      return [...new Set([...boundaries, text.length])].sort((a, b) => a - b);
    }
    const boundaries = new Set([0, text.length]);
    for (const m of text.matchAll(FALLBACK_BOUNDARY_PATTERN)) boundaries.add(m.index! + m[0].length);
    return [...boundaries].sort((a, b) => a - b);
  };
}
