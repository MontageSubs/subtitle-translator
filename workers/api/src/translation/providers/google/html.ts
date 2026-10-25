import { escapeHtml, unescapeHtml } from "../../engine/text";
import { STYLE_TAG_PATTERN } from "../../../subtitle/common/markup";
import { stripHtmlKeepingStyle } from "../../../subtitle/styleTags";
import type { TermMatch } from "../../../subtitle/types";

const DIV_OPEN_PATTERN = /<div/g;
const DIV_CLOSE_PATTERN = /<\/div>/g;
const NO_TRANSLATE_OPEN = "\u2045";
const NO_TRANSLATE_CLOSE = "\u2046";

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
  const fragments: string[] = [];
  DIV_OPEN_PATTERN.lastIndex = 0;
  for (let open = DIV_OPEN_PATTERN.exec(html); open; open = DIV_OPEN_PATTERN.exec(html)) {
    const openEnd = html.indexOf(">", DIV_OPEN_PATTERN.lastIndex);
    if (openEnd === -1) break;
    DIV_CLOSE_PATTERN.lastIndex = openEnd + 1;
    const close = DIV_CLOSE_PATTERN.exec(html);
    if (!close) break;
    fragments.push(cleanTranslatedFragment(html.slice(openEnd + 1, close.index)));
    DIV_OPEN_PATTERN.lastIndex = DIV_CLOSE_PATTERN.lastIndex;
  }
  return fragments;
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

export function activateNoTranslateSpans(html: string): string {
  let open = html.indexOf(NO_TRANSLATE_OPEN);
  if (open === -1) return html;
  const pieces: string[] = [];
  let cursor = 0;
  while (open !== -1) {
    const close = html.indexOf(NO_TRANSLATE_CLOSE, open + 1);
    if (close === -1) break;
    pieces.push(html.slice(cursor, open), '<span translate="no">', html.slice(open + 1, close), "</span>");
    cursor = close + 1;
    open = html.indexOf(NO_TRANSLATE_OPEN, cursor);
  }
  pieces.push(html.slice(cursor));
  return pieces.join("");
}
