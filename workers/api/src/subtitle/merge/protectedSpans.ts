import type { QuotePair } from "../languages/types";
import { CUE_MARKER_PATTERN } from "../markers";
import { ELLIPSIS_PATTERN } from "./characters";
import type { ProtectedSpan } from "./types";

export const BOOK_TITLE_PATTERN = /《[^《》]*》/g;
const LATIN_WORD_PATTERN = /[a-zA-Z]+(?:['’][a-zA-Z]+)*/g;
const STYLE_TAG_SPAN_PATTERN = /<(i|b|u)>[\s\S]*?<\/\1>/gi;
const EMBEDDED_QUOTE_MAX_CHARS = 16;
const embeddedQuotePatterns = new Map<string, RegExp>();

function embeddedQuotePattern([open, close]: QuotePair): RegExp {
  const key = open + close;
  let pattern = embeddedQuotePatterns.get(key);
  if (!pattern) {
    pattern = new RegExp(`${open}[^${open}${close}]*${close}`, "g");
    embeddedQuotePatterns.set(key, pattern);
  }
  return pattern;
}

export function findProtectedSpans(text: string, glossaryTerms: Set<string>, quotes: QuotePair | null): ProtectedSpan[] {
  const spans: ProtectedSpan[] = [];
  for (const pattern of [BOOK_TITLE_PATTERN, STYLE_TAG_SPAN_PATTERN, LATIN_WORD_PATTERN, CUE_MARKER_PATTERN, ELLIPSIS_PATTERN]) {
    for (const m of text.matchAll(pattern)) spans.push([m.index!, m.index! + m[0].length]);
  }
  if (quotes) {
    for (const m of text.matchAll(embeddedQuotePattern(quotes))) {
      if (m.index! > 0 && m.index! + m[0].length < text.length && m[0].length <= EMBEDDED_QUOTE_MAX_CHARS) {
        spans.push([m.index!, m.index! + m[0].length]);
      }
    }
  }
  for (const term of glossaryTerms) {
    if (!term) continue;
    for (let at = text.indexOf(term); at >= 0; at = text.indexOf(term, at + term.length)) spans.push([at, at + term.length]);
  }
  return spans;
}

export function insideProtectedSpan(pos: number, spans: readonly ProtectedSpan[]): boolean {
  return spans.some(([start, end]) => start < pos && pos < end);
}

export function escapeProtectedSpan(pos: number, spans: readonly ProtectedSpan[]): number {
  for (const [start, end] of spans) if (start < pos && pos < end) return pos - start <= end - pos ? start : end;
  return pos;
}
