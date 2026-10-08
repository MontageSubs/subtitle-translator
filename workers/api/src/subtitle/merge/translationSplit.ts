import type { Span } from "../types";
import { enforceQuoteClosure } from "./quotes";
import { enforcePunctuationPlacement, repairEmptyParts } from "./repair";
import { splitByBoundary } from "./splitter";
import type { ProtectedSpan, SplitContext, SplitMethod } from "./types";

const HAS_BRACKET_PATTERN = /[\u27e6\u27e7]/;
const RESIDUAL_MARKER_PATTERN = /\s*(?:\u27e6[^\u27e6\u27e7]*\u27e7|\u27e6[a-zA-Z]?\d{0,6}(?:\.\d+)?|\u27e7)\s*/g;

export function splitTranslation(
  text: string, spans: Span[], protectedSpans: () => readonly ProtectedSpan[], context: SplitContext
): [string[], SplitMethod] {
  const [rawParts, method]: [string[], SplitMethod] =
    spans.length === 1 ? [[text.trim()], "single"] : splitByBoundary(text, spans, protectedSpans(), context);
  const cleaned = rawParts.map((part) => (HAS_BRACKET_PATTERN.test(part) ? part.replace(RESIDUAL_MARKER_PATTERN, " ") : part).trim());
  const placed = enforcePunctuationPlacement(cleaned);
  const repaired = repairEmptyParts(placed, spans, protectedSpans, context);
  return [enforceQuoteClosure(repaired, context.rules.quotes), method];
}
