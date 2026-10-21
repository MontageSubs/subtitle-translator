import { MUSIC_NOTE_CHARS, MUSIC_NOTE_PATTERN } from "../common/charClass";
import { HEAD_ELLIPSIS, HEAD_LOWER, classifyHead } from "./edges";

const EDGE_NOTE_PATTERN = new RegExp(`^[${MUSIC_NOTE_CHARS}\\s]+|[${MUSIC_NOTE_CHARS}\\s]+$`, "g");

export const EDGE_NOTE_LEADING_PATTERN = new RegExp(`^[${MUSIC_NOTE_CHARS}\\s]+`);
export const EDGE_NOTE_TRAILING_PATTERN = new RegExp(`[${MUSIC_NOTE_CHARS}\\s]+$`);

export function musicContinuation(text: string): boolean {
  const remainder = text.replace(MUSIC_NOTE_PATTERN, "").trim();
  const head = classifyHead(remainder);
  return !(head & HEAD_ELLIPSIS) && (head & HEAD_LOWER) !== 0;
}

export const stripEdgeNotes = (text: string): string => text.replace(EDGE_NOTE_PATTERN, "");
