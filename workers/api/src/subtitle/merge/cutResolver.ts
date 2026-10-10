import {
  BOUNDARY_SEARCH_PATTERNS, GENERAL_STRONG_PUNCT_PATTERN, GENERAL_WEAK_PUNCT_PATTERN, HARD_BREAK_PROXIMITY_CHARS,
  HARD_BREAK_PUNCT_TOLERANCE, INFERRED_PUNCT_TOLERANCE, INFERRED_WEAK_PUNCT_TOLERANCE, ORIGINAL_PUNCT_TOLERANCE,
  PUNCT_PROXIMITY_CHARS, PUNCT_PROXIMITY_CHARS_WEAK, nearestTo, type BoundaryFinder, type BoundaryName,
} from "./boundaries";
import type { CandidateIndex } from "./candidates";
import { roundHalfEven } from "./numeric";
import { escapeProtectedSpan, insideProtectedSpan } from "./protectedSpans";

export type CutTag = "original" | "inferred" | "marker" | null;

interface CutRequest {
  candidates: CandidateIndex;
  cursor: number;
  expected: number;
  boundary: BoundaryName | null;
  maxCut: number;
  findBoundaries: BoundaryFinder;
  anchor: number | undefined;
}

export function resolveCut(request: CutRequest): [number, CutTag] {
  const { candidates, cursor, expected, boundary, maxCut, findBoundaries, anchor } = request;
  const { text, protectedSpans } = candidates;
  const ceiling = Math.min(text.length, maxCut);
  if (anchor !== undefined && cursor < anchor && anchor < ceiling) return [anchor, "original"];

  const chunk = Math.max(expected - cursor, 0);

  if (boundary) {
    for (const pattern of BOUNDARY_SEARCH_PATTERNS[boundary]) {
      const ends = candidates.endsBetween(pattern, cursor, ceiling);
      if (!ends.length) continue;
      const cut = nearestTo(ends, expected);
      if (Math.abs(cut - expected) <= Math.max(ORIGINAL_PUNCT_TOLERANCE[boundary] * chunk, PUNCT_PROXIMITY_CHARS)) return [cut, "original"];
      break;
    }
  }

  const strong = candidates.endsBetween(GENERAL_STRONG_PUNCT_PATTERN, cursor, ceiling);
  strong.push(...candidates.leftCutsBetween(cursor, ceiling));
  if (strong.length) {
    const cut = nearestTo(strong, expected);
    const tolerance = boundary === null
      ? Math.max(HARD_BREAK_PUNCT_TOLERANCE * chunk, HARD_BREAK_PROXIMITY_CHARS)
      : Math.max(INFERRED_PUNCT_TOLERANCE * chunk, PUNCT_PROXIMITY_CHARS);
    if (Math.abs(cut - expected) <= tolerance) return [cut, "inferred"];
  }

  const weak = candidates.endsBetween(GENERAL_WEAK_PUNCT_PATTERN, cursor, ceiling);
  if (weak.length) {
    const cut = nearestTo(weak, expected);
    const tolerance = boundary === null
      ? Math.max(HARD_BREAK_PUNCT_TOLERANCE * chunk, HARD_BREAK_PROXIMITY_CHARS)
      : Math.max(INFERRED_WEAK_PUNCT_TOLERANCE * chunk, PUNCT_PROXIMITY_CHARS_WEAK);
    if (Math.abs(cut - expected) <= tolerance) return [cut, "inferred"];
  }

  const boundaries = findBoundaries(text.slice(cursor))
    .map((b) => b + cursor)
    .filter((b) => cursor < b && b < ceiling && !insideProtectedSpan(b, protectedSpans));
  if (boundaries.length) return [nearestTo(boundaries, expected), null];
  return [escapeProtectedSpan(Math.max(cursor + 1, Math.min(roundHalfEven(expected), ceiling - 1)), protectedSpans), null];
}
