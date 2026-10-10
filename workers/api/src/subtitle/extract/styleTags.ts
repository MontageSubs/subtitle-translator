import { hasStyleTag } from "../styleTags";
import type { StyleWrap } from "../types";
import { EDGE_NOTE_LEADING_PATTERN, EDGE_NOTE_TRAILING_PATTERN } from "./music";

const FULL_WRAP_PATTERN = /^<(i|b|u)>([\s\S]*)<\/\1>$/i;

export function splitFullWrap(text: string): { text: string; styleWrap: StyleWrap | null } {
  text = text.trim();
  if (!text.includes("<")) return { text, styleWrap: null };
  const leading = EDGE_NOTE_LEADING_PATTERN.exec(text)?.[0] ?? "";
  const remainder = text.slice(leading.length);
  const trailing = EDGE_NOTE_TRAILING_PATTERN.exec(remainder)?.[0] ?? "";
  const core = trailing ? remainder.slice(0, remainder.length - trailing.length) : remainder;
  const match = FULL_WRAP_PATTERN.exec(core);
  if (!match || hasStyleTag(match[2]!)) return { text, styleWrap: null };
  return { text: `${leading}${match[2]!.trim()}${trailing}`, styleWrap: match[1]!.toLowerCase() as StyleWrap };
}
