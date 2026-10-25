import type { Span } from "../types";
import { enforceQuoteClosure } from "./quotes";
import { enforcePunctuationPlacement, repairEmptyParts } from "./repair";
import { splitByBoundary } from "./splitter";
import type { ProtectedSpan, SplitContext, SplitMethod } from "./types";

const HAS_BRACKET_PATTERN = /[\u27e6\u27e7]/;
const MARKER_PATTERN = /\u27e6[^\u27e6\u27e7]*\u27e7|\u27e6[a-zA-Z]?\d{0,6}(?:\.\d+)?|\u27e7/g;

const WHITESPACE_PATTERN = /\s/;
const isSpace = (text: string, index: number): boolean => WHITESPACE_PATTERN.test(text[index] ?? "");

function removeResidualMarkers(part: string): string {
  let result = "";
  let copied = 0;
  MARKER_PATTERN.lastIndex = 0;
  for (let match = MARKER_PATTERN.exec(part); match; match = MARKER_PATTERN.exec(part)) {
    const markerEnd = match.index + match[0].length;
    let start = match.index;
    let end = markerEnd;
    while (start > copied && isSpace(part, start - 1)) start--;
    while (isSpace(part, end)) end++;
    const before = part.slice(start, match.index);
    const after = part.slice(markerEnd, end);
    result += part.slice(copied, start) + (before && after ? " " : before + after);
    copied = end;
    MARKER_PATTERN.lastIndex = end;
  }
  return result + part.slice(copied);
}

export function splitTranslation(
  text: string, spans: Span[], protectedSpans: () => readonly ProtectedSpan[], context: SplitContext
): [string[], SplitMethod] {
  const [rawParts, method]: [string[], SplitMethod] =
    spans.length === 1 ? [[text.trim()], "single"] : splitByBoundary(text, spans, protectedSpans(), context);
  const cleaned = rawParts.map((part) => (HAS_BRACKET_PATTERN.test(part) ? removeResidualMarkers(part) : part).trim());
  const placed = enforcePunctuationPlacement(cleaned);
  const repaired = repairEmptyParts(placed, spans, protectedSpans, context);
  return [enforceQuoteClosure(repaired, context.rules.quotes), method];
}
