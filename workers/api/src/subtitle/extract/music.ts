import { STYLE_OPEN_ALT } from "./tagAlternations";
import { firstLetterIsLower } from "./letterCase";

export const MUSIC_NOTE_CHARS = "\u2669\u266a\u266b\u266c";

const MUSIC_NOTE_PATTERN = new RegExp(`[${MUSIC_NOTE_CHARS}]`);
const LEADING_ELLIPSIS_PATTERN = new RegExp(`^${STYLE_OPEN_ALT}*(\\.{2,}|\\u2026)`, "i");
const EDGE_NOTE_PATTERN = new RegExp(`^[${MUSIC_NOTE_CHARS}\\s]+|[${MUSIC_NOTE_CHARS}\\s]+$`, "g");

export const EDGE_NOTE_LEADING_PATTERN = new RegExp(`^[${MUSIC_NOTE_CHARS}\\s]+`);
export const EDGE_NOTE_TRAILING_PATTERN = new RegExp(`[${MUSIC_NOTE_CHARS}\\s]+$`);

export const isMusicSegment = (text: string): boolean => MUSIC_NOTE_PATTERN.test(text);

export function musicContinuation(text: string): boolean {
  const remainder = text.replace(MUSIC_NOTE_PATTERN, "").trim();
  return !LEADING_ELLIPSIS_PATTERN.test(remainder) && firstLetterIsLower(remainder);
}

export const stripEdgeNotes = (text: string): string => text.replace(EDGE_NOTE_PATTERN, "");
