import type { QuotePair } from "../languages/types";
import { CUE_MARKER_PATTERN } from "../markers";
import { findBracketPairs } from "./brackets";
import { ELLIPSIS_PATTERN } from "./characters";
import type { ProtectedSpan } from "./types";

export const BOOK_TITLE_PATTERN = /《[^《》]*》/g;
const LATIN_LETTER = "A-Za-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u024F";
const COUNTER_CHARS = "个個名位年月日号號点點时時分秒岁歲次遍回倍条條件只隻张張块塊元万萬亿億千百层層楼樓米斤度周天场場部辆輛双雙种種套份头頭台页頁集章课課期代世纪紀毛角美刀磅吨噸克升级級人つ円歳番本枚匹階冊杯";
const NUMBER_SUFFIX = `\\s?(?:%|‰|°[CF]?|℃|℉|[€£¥₩])|[${COUNTER_CHARS}]`;
const UNIT_PATTERN = new RegExp(
  [
    "(?:[A-Za-z]\\.){2,}",
    `(?:[${LATIN_LETTER}]|[0-9]+[${LATIN_LETTER}])[${LATIN_LETTER}0-9]*(?:['’&-][${LATIN_LETTER}0-9]+)*`,
    "[$€£¥₩]\\s?[0-9][0-9.,]*",
    `第?[0-9][0-9.,]*(?:[:·/\\-–][0-9]+)*(?:${NUMBER_SUFFIX})`,
    "[0-9]+(?:[.,:·/\\-–][0-9]+)+",
    "第[0-9]+",
  ].join("|"),
  "g"
);
const UNIT_GATE_PATTERN = /[A-Za-z0-9$€£¥₩第\u00C0-\u024F]/;
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
  pattern.lastIndex = 0;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) spans.push([match.index, pattern.lastIndex]);
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
  if (UNIT_GATE_PATTERN.test(text)) collectMatchSpans(text, UNIT_PATTERN, spans);
  if (text.includes("\u27e6")) collectMatchSpans(text, CUE_MARKER_PATTERN, spans);
  if (text.includes("..") || text.includes("…")) collectMatchSpans(text, ELLIPSIS_PATTERN, spans);
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
