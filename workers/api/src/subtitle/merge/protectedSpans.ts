import type { QuotePair } from "../languages/types";
import { CUE_MARKER_PATTERN } from "../markers";
import { findBracketPairs } from "./brackets";
import { ELLIPSIS_PATTERN } from "./characters";
import type { ProtectedSpan } from "./types";

export const BOOK_TITLE_PATTERN = /《[^《》]*》/g;
const LATIN_WORD_PATTERN = /[a-zA-Z]+(?:['’][a-zA-Z]+)*/g;
const STYLE_OPEN_PATTERN = /<([ibu])>/gi;
const STYLE_CLOSE_PATTERNS: Readonly<Record<string, RegExp>> = { i: /<\/i>/gi, b: /<\/b>/gi, u: /<\/u>/gi };
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

function collectMatchSpans(text: string, pattern: RegExp, spans: ProtectedSpan[]): void {
  for (const m of text.matchAll(pattern)) spans.push([m.index!, m.index! + m[0].length]);
}

function findStyleTagSpans(text: string): ProtectedSpan[] {
  const spans: ProtectedSpan[] = [];
  const unclosed = new Set<string>();
  STYLE_OPEN_PATTERN.lastIndex = 0;
  for (let open = STYLE_OPEN_PATTERN.exec(text); open; open = STYLE_OPEN_PATTERN.exec(text)) {
    const tag = open[1]!.toLowerCase();
    if (unclosed.has(tag)) continue;
    const closePattern = STYLE_CLOSE_PATTERNS[tag]!;
    closePattern.lastIndex = STYLE_OPEN_PATTERN.lastIndex;
    const close = closePattern.exec(text);
    if (!close) {
      unclosed.add(tag);
      continue;
    }
    spans.push([open.index, closePattern.lastIndex]);
    STYLE_OPEN_PATTERN.lastIndex = closePattern.lastIndex;
  }
  return spans;
}

export function findProtectedSpans(text: string, glossaryTerms: Set<string>, quotes: QuotePair | null, protectBrackets: boolean): ProtectedSpan[] {
  const spans: ProtectedSpan[] = protectBrackets ? findBracketPairs(text) : [];
  collectMatchSpans(text, BOOK_TITLE_PATTERN, spans);
  if (text.includes("<")) spans.push(...findStyleTagSpans(text));
  for (const pattern of [LATIN_WORD_PATTERN, CUE_MARKER_PATTERN, ELLIPSIS_PATTERN]) collectMatchSpans(text, pattern, spans);
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
