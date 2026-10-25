import type { Unit } from "../types";
import { MUSIC_NOTE_CHARS, MUSIC_NOTE_PATTERN } from "../common/charClass";
import { WHITESPACE_COLLAPSE_PATTERN } from "./characters";

const MUSIC_NOTE_LEADING_GAP_PATTERN = new RegExp(`(?<=\\S)([${MUSIC_NOTE_CHARS}])`, "g");
const MUSIC_NOTE_TRAILING_GAP_PATTERN = new RegExp(`([${MUSIC_NOTE_CHARS}])(?=\\S)`, "g");
const MUSIC_INTERIOR_NOTE_PATTERN = new RegExp(`(?<!^)[${MUSIC_NOTE_CHARS}](?!$)`, "g");

export function fixMusicSpacing(text: string): string {
  if (!MUSIC_NOTE_PATTERN.test(text)) return text;
  return text.replace(MUSIC_NOTE_LEADING_GAP_PATTERN, " $1").replace(MUSIC_NOTE_TRAILING_GAP_PATTERN, "$1 ");
}

export function formatMusicLine(text: string): string {
  if (text.length > 1) text = text.replace(MUSIC_INTERIOR_NOTE_PATTERN, "");
  text = text.replace(WHITESPACE_COLLAPSE_PATTERN, " ").trim();
  if (!MUSIC_NOTE_PATTERN.test(text[0] || "")) text = text ? `\u266a${text}` : MUSIC_NOTE_CHARS[0]!;
  if (!MUSIC_NOTE_CHARS.includes(text[text.length - 1]!)) text = `${text}\u266a`;
  return fixMusicSpacing(text).replace(WHITESPACE_COLLAPSE_PATTERN, " ").trim();
}

export function computeCueMusicFlags(units: Unit[]): Map<number, boolean> {
  const flags = new Map<number, boolean>();
  for (const unit of units) {
    for (const span of unit.spans) {
      flags.set(span.id, (flags.get(span.id) ?? true) && span.kind === "music");
    }
  }
  return flags;
}
