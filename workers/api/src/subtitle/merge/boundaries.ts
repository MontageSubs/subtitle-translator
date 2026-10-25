import type { BreakRule, WordCutter } from "../languages/types";

export type BoundaryName = "trail_off" | "comma" | "period" | "colon";

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

const COMMA_ENDINGS = ",，、";
const PERIOD_ENDINGS = ".!?！？";
const COLON_ENDINGS = ":：";
const CLOSING_QUOTES = "'\"”’)]";

export function classifyBoundary(text: string): BoundaryName | null {
  const trimmed = text.trimEnd();
  const last = trimmed.at(-1);
  if (last === undefined) return null;
  if (last === "—" || last === "…" || ((last === "." || last === "-") && trimmed.at(-2) === last)) return "trail_off";
  if (COMMA_ENDINGS.includes(last)) return "comma";
  let end = trimmed.length;
  while (end > 0 && CLOSING_QUOTES.includes(trimmed[end - 1]!)) end--;
  if (end > 0 && PERIOD_ENDINGS.includes(trimmed[end - 1]!)) return "period";
  return COLON_ENDINGS.includes(last) ? "colon" : null;
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

function dottedNameRuns(pieces: readonly string[]): [number, number][] {
  const runs: [number, number][] = [];
  let previousStart = 0;
  let at = pieces[0]?.length ?? 0;
  let index = 1;
  while (index + 1 < pieces.length) {
    const piece = pieces[index]!;
    if (!NAME_JOINERS.has(piece)) {
      previousStart = at;
      at += piece.length;
      index++;
      continue;
    }
    let last = index + 1;
    let end = at + piece.length + pieces[last]!.length;
    while (NAME_JOINERS.has(pieces[last + 1] ?? "") && last + 2 < pieces.length) {
      end += pieces[last + 1]!.length + pieces[last + 2]!.length;
      last += 2;
    }
    runs.push([previousStart, end]);
    previousStart = end - pieces[last]!.length;
    at = end;
    index = last + 1;
  }
  return runs;
}

function nextContentPiece(pieces: readonly string[], from: number): string {
  for (let index = from; index < pieces.length; index++) if (pieces[index]!.trim()) return pieces[index]!;
  return "";
}

function allowedBoundaries(pieces: readonly string[], rule: BreakRule | null, textLength: number): number[] {
  const runs = rule ? dottedNameRuns(pieces) : [];
  const insideRun = (position: number, long: boolean) =>
    runs.some(([start, end]) => position > start && position < end && end - start > LONG_NAME_CHARS === long);
  const open: number[] = [];
  const ruled: number[] = [];
  let at = 0;
  let before = "";
  for (let index = 0; index < pieces.length; index++) {
    const piece = pieces[index]!;
    at += piece.length;
    if (piece.trim()) before = piece;
    if (at >= textLength) continue;
    if (runs.length && (insideRun(at, false) || (!NAME_JOINERS.has(piece) && insideRun(at, true)))) continue;
    open.push(at);
    if (rule && !rule.noCueEnd.has(before) && !rule.noCueStart.has(nextContentPiece(pieces, index + 1))) ruled.push(at);
  }
  return rule && ruled.length ? ruled : open;
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
