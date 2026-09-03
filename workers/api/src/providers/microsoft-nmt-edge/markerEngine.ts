import { repairCorruptMarkers } from "../shared/markerRepair";
import { CUE_MARKER_PATTERN, cueMarkerTag } from "../../core/cueMarker";

const FORMAT_TAG_ESCAPE_PATTERNS: Array<[RegExp, string]> = [
  [/\s*<b\b[^>]*>\s*/gi, "⟦b⟧"],
  [/\s*<\/b>\s*/gi, "⟦/b⟧"],
  [/\s*<i\b[^>]*>\s*/gi, "⟦i⟧"],
  [/\s*<\/i>\s*/gi, "⟦/i⟧"],
];

const FORMAT_TAG_RESTORE_PATTERNS: Array<[RegExp, string]> = [
  [/⟦\s*b\s*⟧/gi, "<b>"],
  [/⟦\s*\/\s*b\s*⟧/gi, "</b>"],
  [/⟦\s*i\s*⟧/gi, "<i>"],
  [/⟦\s*\/\s*i\s*⟧/gi, "</i>"],
];

const STYLE_MARKER_MISSING_OPEN_PATTERN = /(?<!⟦)\/(b|i)⟧/gi;
const STYLE_MARKER_MISSING_CLOSE_PATTERN = /⟦(b|i)(?!⟧)/gi;

function repairStyleMarkers(text: string): string {
  const withOpen = text.replace(STYLE_MARKER_MISSING_OPEN_PATTERN, (_, tag) => `⟦/${tag.toLowerCase()}⟧`);
  return withOpen.replace(STYLE_MARKER_MISSING_CLOSE_PATTERN, (_, tag) => `⟦${tag.toLowerCase()}⟧`);
}

const STYLE_LITERAL_TAG_PATTERN = /<\/?(b|i)>/gi;
const STYLE_LITERAL_TAG_TEST_PATTERN = /<\/?(b|i)>/i;

export function styleTagsBalanced(text: string): boolean {
  const depth: Record<string, number> = { b: 0, i: 0 };
  for (const m of text.matchAll(STYLE_LITERAL_TAG_PATTERN)) {
    const token = m[0].toLowerCase();
    const tag = token.replace(/[</>]/g, "");
    depth[tag] += token[1] === "/" ? -1 : 1;
    if (depth[tag] < 0) return false;
  }
  return Object.values(depth).every((v) => v === 0);
}

export function sanitizeStyleTags(text: string): string {
  if (!STYLE_LITERAL_TAG_TEST_PATTERN.test(text)) return text;
  return styleTagsBalanced(text) ? text : text.replace(STYLE_LITERAL_TAG_PATTERN, "");
}

export function escapeFormattingTags(text: string): string {
  if (!text) return text;
  let res = text;
  for (const [pattern, repl] of FORMAT_TAG_ESCAPE_PATTERNS) {
    res = res.replace(pattern, repl);
  }
  return res;
}

export function restoreFormattingTags(text: string): string {
  if (!text) return text;
  let res = repairStyleMarkers(text);
  for (const [pattern, repl] of FORMAT_TAG_RESTORE_PATTERNS) {
    res = res.replace(pattern, repl);
  }
  return res;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function unescapeHtml(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export const GROUP_MARKER_TEMPLATE = (id: number | string) => `⟦m${id}⟧`;
export const UNIT_MARKER_TEMPLATE = (id: number | string) => `⟦u${id}⟧`;
export const CUE_MARKER_TEMPLATE = cueMarkerTag;

export const GROUP_MARKER_PATTERN = /⟦m([^⟦⟧]+)⟧/gi;
export const UNIT_MARKER_PATTERN = /⟦u([^⟦⟧]+)⟧/gi;
export { CUE_MARKER_PATTERN };

const TAG_PATTERN = /<[^>]+>/g;

export interface SpanProtected {
  start: number;
  end: number;
  wrap: boolean;
  target?: string;
}

export function protectContentHtml(
  text: string,
  termMatches: Array<{ start: number; end: number; target?: string }> = []
): string {
  const spans: SpanProtected[] = [];

  for (const m of text.matchAll(CUE_MARKER_PATTERN)) {
    if (m.index !== undefined) {
      spans.push({ start: m.index, end: m.index + m[0].length, wrap: false });
    }
  }

  for (const tm of termMatches) {
    spans.push({ start: tm.start, end: tm.end, wrap: true, target: tm.target });
  }

  spans.sort((a, b) => a.start - b.start);

  const merged: SpanProtected[] = [];
  for (const span of spans) {
    if (merged.length > 0 && span.start <= merged[merged.length - 1]!.end && span.wrap === merged[merged.length - 1]!.wrap) {
      merged[merged.length - 1]!.end = Math.max(merged[merged.length - 1]!.end, span.end);
      if (!merged[merged.length - 1]!.target) {
        merged[merged.length - 1]!.target = span.target;
      }
    } else {
      merged.push({ ...span });
    }
  }

  const pieces: string[] = [];
  let cursor = 0;
  for (const span of merged) {
    if (span.start > cursor) {
      pieces.push(escapeHtml(escapeFormattingTags(text.substring(cursor, span.start))));
    }
    const piece = escapeHtml(escapeFormattingTags(text.substring(span.start, span.end)));
    if (span.wrap) {
      const target = span.target ? escapeHtml(span.target) : piece;
      pieces.push(`<mstrans:dictionary translation="${target}">${piece}</mstrans:dictionary>`);
    } else {
      pieces.push(piece);
    }
    cursor = span.end;
  }
  if (cursor < text.length) {
    pieces.push(escapeHtml(escapeFormattingTags(text.substring(cursor))));
  }

  return pieces.join("");
}

export function extractMarkerFreeResponse(html: string): string {
  return restoreFormattingTags(unescapeHtml(html.replace(TAG_PATTERN, "")).trim());
}

export function parseTranslatedHtml(
  html: string,
  pattern: RegExp,
  prefixChar?: string,
  expectedIds?: (string | number)[]
): Record<string, string> {
  let flat = unescapeHtml(html.replace(TAG_PATTERN, ""));
  if (prefixChar && expectedIds && expectedIds.length > 0) {
    flat = repairCorruptMarkers(flat, prefixChar, expectedIds);
  }
  const result: Record<string, string> = {};
  const parts = flat.split(pattern);
  const seen = new Set<string>();

  for (let i = 1; i < parts.length; i += 2) {
    const key = parts[i]!.trim();
    if (!/^\d+(?:\.\d+)?$/.test(key)) continue;

    if (seen.has(key)) {
      delete result[key];
      continue;
    }
    seen.add(key);
    const text = (parts[i + 1] || "").trim();
    if (text) {
      result[key] = restoreFormattingTags(text);
    }
  }
  return result;
}
