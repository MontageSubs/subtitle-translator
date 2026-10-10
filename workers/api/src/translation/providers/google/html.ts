import { escapeHtml, unescapeHtml } from "../../engine/text";
import { STYLE_TAG_PATTERN } from "../../../subtitle/common/markup";
import { stripHtmlKeepingStyle } from "../../../subtitle/styleTags";
import type { TermMatch } from "../../../subtitle/types";

const PLAIN_DIV_PATTERN = /<div[^>]*>([\s\S]*?)<\/div>/g;
const NO_TRANSLATE_OPEN = "\u2045";
const NO_TRANSLATE_CLOSE = "\u2046";
const NO_TRANSLATE_SENTINEL_PATTERN = /\u2045([\s\S]*?)\u2046/g;

export function escapeHtmlPreservingStyle(text: string): string {
  if (!text.includes("<")) return escapeHtml(text);
  let result = "";
  let cursor = 0;
  for (const match of text.matchAll(STYLE_TAG_PATTERN)) {
    result += escapeHtml(text.slice(cursor, match.index)) + match[0].toLowerCase();
    cursor = match.index! + match[0].length;
  }
  return result + escapeHtml(text.slice(cursor));
}

export function cleanTranslatedFragment(raw: string): string {
  if (!raw.includes("<")) return unescapeHtml(raw).trim();
  return unescapeHtml(stripHtmlKeepingStyle(raw)).trim();
}

export function parsePlainDivs(html: string): string[] {
  return Array.from(html.matchAll(PLAIN_DIV_PATTERN), (match) => cleanTranslatedFragment(match[1]!));
}

export function markTermsForTransport(text: string, matches: readonly TermMatch[]): string {
  if (!matches.length) return text;
  const ranges: [number, number][] = [];
  for (const { start, end } of [...matches].sort((a, b) => a.start - b.start)) {
    const last = ranges[ranges.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else ranges.push([start, end]);
  }
  const pieces: string[] = [];
  let cursor = 0;
  for (const [start, end] of ranges) {
    pieces.push(text.slice(cursor, start), NO_TRANSLATE_OPEN, text.slice(start, end), NO_TRANSLATE_CLOSE);
    cursor = end;
  }
  pieces.push(text.slice(cursor));
  return pieces.join("");
}

export const activateNoTranslateSpans = (html: string): string => html.replace(NO_TRANSLATE_SENTINEL_PATTERN, '<span translate="no">$1</span>');
