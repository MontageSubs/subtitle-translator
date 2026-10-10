import type { Span } from "../types";
import type { WordCutter } from "../languages/types";
import { wordBoundaries, nearestTo } from "./boundaries";
import { NO_LINE_END_CHARS, NO_LINE_START_CHARS, hasContent } from "./characters";
import { effectiveLength } from "../common/lineMetrics";
import { roundHalfEven } from "./numeric";
import { BOOK_TITLE_PATTERN, insideProtectedSpan } from "./protectedSpans";
import { sliceByCuts, splitByBoundary } from "./splitter";
import type { ProtectedSpan, SplitContext } from "./types";

export function enforcePunctuationPlacement(parts: string[]): string[] {
  parts = [...parts];
  for (let i = 0; i < parts.length - 1; i++) {
    while (parts[i] && NO_LINE_END_CHARS.has(parts[i]!.at(-1)!)) {
      parts[i + 1] = parts[i]!.at(-1)! + parts[i + 1];
      parts[i] = parts[i]!.slice(0, -1);
    }
    while (parts[i + 1] && NO_LINE_START_CHARS.has(parts[i + 1]![0]!)) {
      parts[i] = parts[i]! + parts[i + 1]![0];
      parts[i + 1] = parts[i + 1]!.slice(1);
    }
  }
  return parts.map((part) => part.trim());
}

function proportionalSplit(text: string, spans: Span[], cutter: WordCutter | null): string[] | null {
  const titleSpans: ProtectedSpan[] = [...text.matchAll(BOOK_TITLE_PATTERN)].map((m) => [m.index!, m.index! + m[0].length]);
  const boundaries = wordBoundaries(text, cutter).filter((boundary) => !insideProtectedSpan(boundary, titleSpans));
  if (boundaries.length <= 2) return null;
  const weights = spans.map((span) => effectiveLength(span.text));
  const total = weights.reduce((a, b) => a + b, 0) || weights.length;
  let cumulative = 0;
  const cuts = weights.slice(0, -1).map((weight) => {
    cumulative += weight;
    return nearestTo(boundaries, roundHalfEven((text.length * cumulative) / total));
  });
  const distinct = [...new Set(cuts.filter((cut) => cut > 0 && cut < text.length))].sort((a, b) => a - b);
  return distinct.length === spans.length - 1 ? sliceByCuts(text, distinct) : null;
}

export function repairEmptyParts(parts: string[], spans: Span[], protectedSpans: () => readonly ProtectedSpan[], context: SplitContext): string[] {
  parts = [...parts];
  for (let i = 0; i < parts.length; i++) {
    if (hasContent(parts[i]!) || !hasContent(spans[i]!.text)) continue;
    const neighbor = i > 0 ? i - 1 : i + 1;
    if (neighbor >= parts.length) continue;
    const lo = Math.min(i, neighbor);
    const hi = Math.max(i, neighbor);
    const pair = spans.slice(lo, hi + 1);
    let [fixed] = splitByBoundary(parts[neighbor]!, pair, protectedSpans(), context);
    if (!hasContent(fixed[i - lo]!)) {
      const proportional = proportionalSplit(parts[neighbor]!, pair, context.cutter);
      if (proportional && hasContent(proportional[i - lo]!)) fixed = proportional;
    }
    parts[lo] = fixed[0]!;
    parts[hi] = fixed[1]!;
  }
  return parts;
}
