import type { Span } from "../types";
import { CandidateIndex } from "./candidates";
import { computeExpectedPositions, refineExpectedPositions, resolveAnchorCuts, resolveMarkerAnchors } from "./anchors";
import { classifyBoundary } from "./boundaries";
import { resolveCut, type CutTag } from "./cutResolver";
import { effectiveLength } from "../common/lineMetrics";
import { buildWeightPrefix } from "./numeric";
import { rebalanceDisproportionateCuts, snapCutsForwardToPunct } from "./rebalance";
import type { ProtectedSpan, SplitContext, SplitMethod } from "./types";

function methodOf(tags: CutTag[]): SplitMethod {
  if (tags.includes("marker")) return tags.every((tag) => tag === null || tag === "marker") ? "marker_boundary" : "mixed_boundary";
  if (tags.includes("original")) return "original_boundary";
  return tags.includes("inferred") ? "inferred_punctuation" : "word_boundary";
}

export function sliceByCuts(text: string, cuts: number[]): string[] {
  const parts: string[] = [];
  let cursor = 0;
  for (const cut of cuts) {
    parts.push(text.slice(cursor, cut).trim());
    cursor = cut;
  }
  parts.push(text.slice(cursor).trim());
  return parts;
}

export function splitByBoundary(
  text: string, spans: Span[], protectedSpans: readonly ProtectedSpan[], context: SplitContext
): [string[], SplitMethod] {
  const boundaryTypes = spans.slice(0, -1).map((span) => classifyBoundary(span.text));
  const lengths = spans.map((span) => effectiveLength(span.text));
  const prefix = buildWeightPrefix(text);
  const expected = computeExpectedPositions(text.length, lengths, prefix);
  const markerAnchors = resolveMarkerAnchors(text, spans);
  const candidates = new CandidateIndex(text, protectedSpans);
  const needsPunctuationAnchors = context.anchorsEnabled && markerAnchors.size < spans.length - 1;
  const anchors = needsPunctuationAnchors ? resolveAnchorCuts(candidates, boundaryTypes, expected) : new Map<number, number>();
  for (const [index, position] of markerAnchors) anchors.set(index, position);
  const refined = refineExpectedPositions(lengths, anchors, expected, text.length);

  const cuts: number[] = [];
  const tags: CutTag[] = [];
  let cursor = 0;
  for (let i = 0; i < spans.length - 1; i++) {
    const [cut, tag] = resolveCut({
      candidates, cursor, expected: refined[i]!, boundary: boundaryTypes[i]!, maxCut: text.length - (spans.length - 1 - i),
      cutter: context.cutter, anchor: anchors.get(i),
    });
    tags.push(markerAnchors.get(i) === cut ? "marker" : tag);
    cuts.push(cut);
    cursor = cut;
  }

  const locked = new Set(tags.flatMap((tag, i) => (tag === "marker" ? [i] : [])));
  const rebalanced = rebalanceDisproportionateCuts(candidates, lengths, prefix, cuts, locked, context.cutter);
  const finalCuts = snapCutsForwardToPunct(text, rebalanced, locked, tags, protectedSpans);
  return [sliceByCuts(text, finalCuts), methodOf(tags)];
}
