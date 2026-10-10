import { GENERAL_STRONG_PUNCT_PATTERN, nearestTo, type BoundaryFinder } from "./boundaries";
import type { CandidateIndex } from "./candidates";
import { bisectLeft, roundHalfEven } from "./numeric";
import { escapeProtectedSpan, insideProtectedSpan } from "./protectedSpans";
import type { ProtectedSpan } from "./types";

const DISPROPORTION_MIN_RATIO = 0.55;
const DISPROPORTION_MAX_RATIO = 1.85;
const REBALANCE_SNAP_TOLERANCE = 0.12;
const REBALANCE_SNAP_FLOOR = 3;
const FORWARD_SNAP_WINDOW = 3;

const sum = (values: number[]): number => values.reduce((a, b) => a + b, 0);

function mergeBadRuns(bad: Set<number>, count: number): [number, number][] {
  const runs: [number, number][] = [];
  for (const index of [...bad].sort((a, b) => a - b)) {
    const lo = Math.max(0, index - 1);
    const hi = Math.min(count - 1, index + 1);
    const last = runs[runs.length - 1];
    if (last && lo <= last[1] + 1) last[1] = Math.max(last[1], hi);
    else runs.push([lo, hi]);
  }
  return runs;
}

function snapOrInterpolate(
  candidates: CandidateIndex, ideal: number, [lo, hi]: [number, number], findBoundaries: BoundaryFinder, tolerance: number
): number {
  const { text, protectedSpans } = candidates;
  const punctuation = candidates.endsBetween(GENERAL_STRONG_PUNCT_PATTERN, lo, hi).filter((candidate) => Math.abs(candidate - ideal) <= tolerance);
  if (punctuation.length) return nearestTo(punctuation, ideal);
  const boundaries = findBoundaries(text.slice(lo, hi))
    .map((b) => b + lo)
    .filter((b) => lo < b && b < hi && !insideProtectedSpan(b, protectedSpans));
  return boundaries.length ? nearestTo(boundaries, ideal) : escapeProtectedSpan(roundHalfEven(ideal), protectedSpans);
}

export function rebalanceDisproportionateCuts(
  candidates: CandidateIndex, lengths: number[], prefix: ArrayLike<number>, cuts: number[], locked: Set<number>, findBoundaries: BoundaryFinder
): number[] {
  const { text } = candidates;
  if (lengths.length < 2) return cuts;
  const totalLength = sum(lengths) || 1;
  const totalWeight = prefix[prefix.length - 1]!;
  if (totalWeight <= 0) return cuts;
  const boundaries = [0, ...cuts, text.length];
  const bad = new Set<number>();
  lengths.forEach((length, i) => {
    const expectedWeight = totalWeight * (length / totalLength);
    const ratio = expectedWeight > 0 ? (prefix[boundaries[i + 1]!]! - prefix[boundaries[i]!]!) / expectedWeight : 1;
    if (ratio < DISPROPORTION_MIN_RATIO || ratio > DISPROPORTION_MAX_RATIO) bad.add(i);
  });
  if (!bad.size) return cuts;

  const newCuts = [...cuts];
  for (const [lo, hi] of mergeBadRuns(bad, lengths.length)) {
    const hasFreeCut = Array.from({ length: hi - lo }, (_, k) => lo + k).some((k) => !locked.has(k));
    if (!hasFreeCut) continue;
    const startPos = boundaries[lo]!;
    const endPos = boundaries[hi + 1]!;
    const subLengths = lengths.slice(lo, hi + 1);
    const subTotal = sum(subLengths) || 1;
    const subWeight = prefix[endPos]! - prefix[startPos]!;
    let cumulative = 0;
    let cursor = startPos;
    for (let k = lo; k < hi; k++) {
      cumulative += subLengths[k - lo]!;
      if (locked.has(k)) {
        cursor = newCuts[k]!;
        continue;
      }
      const targetWeight = prefix[startPos]! + subWeight * (cumulative / subTotal);
      const slots = Math.max(hi - k, 1);
      const ideal = Math.max(cursor + 1, Math.min(Math.max(0, Math.min(bisectLeft(prefix, targetWeight) - 1, text.length)), endPos - slots));
      const tolerance = Math.max((REBALANCE_SNAP_TOLERANCE * (endPos - startPos)) / (hi - lo), REBALANCE_SNAP_FLOOR);
      const cut = Math.max(cursor + 1, Math.min(snapOrInterpolate(candidates, ideal, [cursor, endPos], findBoundaries, tolerance), endPos - slots));
      newCuts[k] = cut;
      cursor = cut;
    }
  }
  return newCuts;
}

export function snapCutsForwardToPunct(
  text: string, cuts: number[], locked: Set<number>, tags: (string | null)[], protectedSpans: readonly ProtectedSpan[]
): number[] {
  const result = [...cuts];
  for (let i = 0; i < result.length; i++) {
    if (locked.has(i) || tags[i] === "original") continue;
    const cursor = result[i]!;
    const ceiling = i + 1 < result.length ? result[i + 1]! : text.length;
    const windowEnd = Math.min(cursor + FORWARD_SNAP_WINDOW, ceiling);
    if (windowEnd <= cursor) continue;

    const windowText = text.slice(0, windowEnd);
    GENERAL_STRONG_PUNCT_PATTERN.lastIndex = cursor;
    let earliest = Infinity;
    for (let match = GENERAL_STRONG_PUNCT_PATTERN.exec(windowText); match; match = GENERAL_STRONG_PUNCT_PATTERN.exec(windowText)) {
      const end = match.index + match[0].length;
      if (end < earliest && !insideProtectedSpan(end, protectedSpans)) earliest = end;
    }
    if (earliest !== Infinity) result[i] = earliest;
  }
  return result;
}
