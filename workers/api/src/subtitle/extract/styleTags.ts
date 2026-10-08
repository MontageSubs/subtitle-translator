import type { StyleWrap } from "../types";
import { EDGE_NOTE_LEADING_PATTERN, EDGE_NOTE_TRAILING_PATTERN } from "./music";

const TAG_PATTERN = /<[^>]+>|\{[^}]*\}/g;
const STYLE_TAG_PATTERN = /<\/?(i|b|u)>/gi;
const STYLE_TAG_TEST_PATTERN = /<\/?(i|b|u)>/i;
const STYLE_TAG_PLACEHOLDER = (index: number) => `\u0001${index}\u0001`;
const STYLE_TAG_PLACEHOLDER_PATTERN = /\u0001(\d+)\u0001/g;
const STYLE_TAG_JOIN_PATTERN = /<\/(i|b|u)>(\s*)<\1>/gi;
const FULL_WRAP_PATTERN = /^<(i|b|u)>([\s\S]*)<\/\1>$/i;

export function stripTagsPreservingStyle(line: string): string {
  if (!line.includes("<") && !line.includes("{")) return line;
  const preserved: string[] = [];
  const guarded = line.replace(STYLE_TAG_PATTERN, (tag) => {
    preserved.push(tag.toLowerCase());
    return STYLE_TAG_PLACEHOLDER(preserved.length - 1);
  });
  return guarded.replace(TAG_PATTERN, "").replace(STYLE_TAG_PLACEHOLDER_PATTERN, (_, i) => preserved[Number(i)]!);
}

export const collapseAdjacentStyleWraps = (text: string): string => text.replace(STYLE_TAG_JOIN_PATTERN, "$2");

export function splitFullWrap(text: string): { text: string; styleWrap: StyleWrap | null } {
  text = text.trim();
  if (!text.includes("<")) return { text, styleWrap: null };
  const leading = EDGE_NOTE_LEADING_PATTERN.exec(text)?.[0] ?? "";
  const remainder = text.slice(leading.length);
  const trailing = EDGE_NOTE_TRAILING_PATTERN.exec(remainder)?.[0] ?? "";
  const core = trailing ? remainder.slice(0, remainder.length - trailing.length) : remainder;
  const match = FULL_WRAP_PATTERN.exec(core);
  if (!match || STYLE_TAG_TEST_PATTERN.test(match[2]!)) return { text, styleWrap: null };
  return { text: `${leading}${match[2]!.trim()}${trailing}`, styleWrap: match[1]!.toLowerCase() as StyleWrap };
}
