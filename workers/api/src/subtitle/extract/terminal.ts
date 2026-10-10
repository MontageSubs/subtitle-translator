import { STYLE_CLOSE_ALT } from "../common/markup";

const CLOSE_QUOTE_CHARS = "\"'\u201d\u2019\u00bb\u203a\u300d\u300f\u301e\u301f";
const CLOSE_BRACKET_CHARS = ")\\]}>\uff09\uff3d\uff5d\uff1e\u3015\u3017\u3019\u301b\u3009\u300b\u3011\u27e9\u27eb";
const DECORATION_CHARS = "*\u2020\u2021\u203b\u2605\u2606";
const CLOSING_WRAP_ALT = `[${CLOSE_QUOTE_CHARS}${CLOSE_BRACKET_CHARS}${DECORATION_CHARS}]*`;

const TERMINAL_PUNCT_PATTERN = new RegExp(`[.!?\\u2026\\u22ef\\u3002\\uff01\\uff1f]${CLOSING_WRAP_ALT}${STYLE_CLOSE_ALT}*\\s*$`, "i");
const TRAILING_ELLIPSIS_PATTERN = new RegExp(`(\\.{2,}|\\u2026|\\u22ef)${STYLE_CLOSE_ALT}*\\s*$`, "i");
const TRAILING_CUTOFF_PATTERN = new RegExp(`-{2,}${CLOSING_WRAP_ALT}${STYLE_CLOSE_ALT}*\\s*$`, "i");

export const TRAILING_SINGLE_CUTOFF_PATTERN = new RegExp(`(?<!-)-${CLOSING_WRAP_ALT}${STYLE_CLOSE_ALT}*\\s*$`, "i");

export function hasTerminalPunct(text: string): boolean {
  if (TRAILING_ELLIPSIS_PATTERN.test(text)) return false;
  return TRAILING_CUTOFF_PATTERN.test(text) || TERMINAL_PUNCT_PATTERN.test(text);
}
