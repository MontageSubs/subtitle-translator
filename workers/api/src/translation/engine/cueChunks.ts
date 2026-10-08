import { CUE_MARKER_PATTERN, cueMarkerTag } from "../../subtitle/markers";
import { stripEdgeNotes } from "../../subtitle/extract/music";
import type { Span, TermMatch, Unit } from "../../subtitle/types";

export function splitByMarker(text: string, pattern: RegExp, keepEmpty: boolean): Map<string, string> {
  const parts = text.split(pattern);
  const chunks = new Map<string, string>();
  const seen = new Set<string>();
  for (let i = 1; i < parts.length; i += 2) {
    const key = parts[i]!;
    if (seen.has(key)) {
      chunks.delete(key);
      continue;
    }
    seen.add(key);
    const chunk = (parts[i + 1] || "").trim();
    if (chunk || keepEmpty) chunks.set(key, chunk);
  }
  return chunks;
}

export const splitCueChunks = (text: string | null | undefined): Map<string, string> => splitByMarker(text || "", CUE_MARKER_PATTERN, true);

export const expectedCueIds = (unit: Unit): string[] => unit.spans.filter((span) => span.boundary === "marker").map((span) => span.marker_id);

export function missingCueIds(unit: Unit, text: string | null | undefined): string[] {
  const expected = expectedCueIds(unit);
  if (!expected.length) return [];
  const present = splitCueChunks(text);
  return expected.filter((id) => !present.has(id));
}

export function patchMissingCues(text: string, expectedIds: string[], recovered: Map<string, string>, spaced: boolean): string {
  if (!recovered.size) return text;
  const chunks = splitCueChunks(text);
  for (const [id, chunk] of recovered) chunks.set(id, chunk);
  const separator = spaced ? " " : "";
  return expectedIds.filter((id) => chunks.has(id)).map((id) => `${cueMarkerTag(id)}${separator}${chunks.get(id)}`).join(separator);
}

export const isCueAddressableSpan = (unit: Unit, span: Span): boolean =>
  span.boundary === "marker" || (unit.spans.length === 1 && unit.resolved === null);

export interface CueIndex {
  order: string[];
  textById: Map<string, string>;
  termsById: Map<string, TermMatch[]>;
}

function projectTerms(unit: Unit): Map<string, TermMatch[]> {
  const projected = new Map<string, TermMatch[]>();
  if (!unit.term_matches.length) {
    for (const span of unit.spans) projected.set(span.marker_id, []);
    return projected;
  }
  let cursor = 0;
  for (const span of unit.spans) {
    const visible = span.kind === "music" ? stripEdgeNotes(span.text) : span.text;
    const start = unit.text.indexOf(visible, cursor);
    if (start === -1) {
      projected.set(span.marker_id, []);
      continue;
    }
    const end = start + visible.length;
    cursor = end;
    const shift = span.text.indexOf(visible) - start;
    projected.set(
      span.marker_id,
      unit.term_matches.filter((m) => start <= m.start && m.end <= end).map((m) => ({ ...m, start: m.start + shift, end: m.end + shift }))
    );
  }
  return projected;
}

export function buildCueIndex(units: Unit[]): CueIndex {
  const index: CueIndex = { order: [], textById: new Map(), termsById: new Map() };
  for (const unit of units) {
    const projected = projectTerms(unit);
    for (const span of unit.spans) {
      if (!isCueAddressableSpan(unit, span)) continue;
      index.order.push(span.marker_id);
      index.textById.set(span.marker_id, span.text);
      index.termsById.set(span.marker_id, projected.get(span.marker_id) ?? []);
    }
  }
  return index;
}

export function singleCueId(unit: Unit): string | null {
  return unit.spans.length === 1 && expectedCueIds(unit).length === 0 ? String(unit.spans[0]!.id) : null;
}
