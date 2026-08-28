import { Cue, Unit } from "../../core/types";
import { Glossary } from "../../core/srtExtract";

const FORMAT_TAG_ESCAPE_PATTERNS: Array<[RegExp, string]> = [
  [/<b\b[^>]*>/gi, "⟦b⟧"],
  [/<\/b>/gi, "⟦/b⟧"],
  [/<i\b[^>]*>/gi, "⟦i⟧"],
  [/<\/i>/gi, "⟦/i⟧"],
];

const FORMAT_TAG_RESTORE_PATTERNS: Array<[RegExp, string]> = [
  [/⟦\s*b\s*⟧/gi, "<b>"],
  [/⟦\s*\/\s*b\s*⟧/gi, "</b>"],
  [/⟦\s*i\s*⟧/gi, "<i>"],
  [/⟦\s*\/\s*i\s*⟧/gi, "</i>"],
];

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
  let res = text;
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

export function unescapeHtml(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export const GROUP_MARKER_TEMPLATE = (id: number | string) => `⟦m${id}⟧`;
export const UNIT_MARKER_TEMPLATE = (id: number | string) => `⟦u${id}⟧`;
export const CUE_MARKER_TEMPLATE = (id: number) => `⟦c${id.toString().padStart(4, "0")}⟧`;

export const GROUP_MARKER_PATTERN = /⟦m([^⟦⟧]+)⟧/g;
export const UNIT_MARKER_PATTERN = /⟦u([^⟦⟧]+)⟧/g;
export const CUE_MARKER_PATTERN = /⟦c(\d+)⟧/g;

export const TAG_PATTERN = /<[^>]+>/g;

export function buildProtectedHtml(text: string, glossary: Glossary, caseSensitive: boolean): string {
  let escaped = escapeFormattingTags(text);
  if (!glossary || Object.keys(glossary).length === 0) {
    return escapeHtml(escaped);
  }

  // A simple glossary replacement logic
  let pieces: string[] = [];
  let cursor = 0;
  const terms = Object.keys(glossary).sort((a, b) => b.length - a.length);

  while (cursor < escaped.length) {
    let matchTerm: string | null = null;
    let matchIndex = -1;
    let matchTarget: string | null = null;

    for (const term of terms) {
      const idx = caseSensitive ? escaped.indexOf(term, cursor) : escaped.toLowerCase().indexOf(term.toLowerCase(), cursor);
      if (idx !== -1 && (matchIndex === -1 || idx < matchIndex)) {
        matchIndex = idx;
        matchTerm = escaped.substring(idx, idx + term.length);
        matchTarget = glossary[term]!;
      }
    }

    if (matchIndex !== -1 && matchTerm !== null && matchTarget !== null) {
      pieces.push(escapeHtml(escaped.substring(cursor, matchIndex)));
      pieces.push(`<mstrans:dictionary translation="${escapeHtml(matchTarget)}">${escapeHtml(matchTerm)}</mstrans:dictionary>`);
      cursor = matchIndex + matchTerm.length;
    } else {
      pieces.push(escapeHtml(escaped.substring(cursor)));
      break;
    }
  }

  return pieces.join("");
}

export function parseTranslatedHtml(html: string, pattern: RegExp): Record<number, string> {
  const flat = unescapeHtml(html.replace(TAG_PATTERN, ""));
  const result: Record<number, string> = {};
  const parts = flat.split(pattern);
  const seen = new Set<string>();

  for (let i = 1; i < parts.length; i += 2) {
    const key = parts[i]!;
    if (seen.has(key)) {
      delete result[parseInt(key, 10)];
      continue;
    }
    seen.add(key);
    const text = (parts[i + 1] || "").trim();
    if (text) {
      result[parseInt(key, 10)] = text;
    }
  }
  return result;
}
