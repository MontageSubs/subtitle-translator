import type { Cue } from "../types";
import { collapseAdjacentStyleWraps } from "../common/markup";
import { stripTagsKeepingStyle } from "../styleTags";

const WHITESPACE_PATTERN = /\s+/g;
const UNFOLDED_PATTERN = /[^\S ]|  |^ | $/;

function foldLine(rawLine: string): string {
  const stripped = stripTagsKeepingStyle(rawLine);
  return UNFOLDED_PATTERN.test(stripped) ? stripped.replace(WHITESPACE_PATTERN, " ").trim() : stripped;
}

function foldText(raw: string): string {
  if (!raw.includes("\n")) return collapseAdjacentStyleWraps(foldLine(raw));
  const lines: string[] = [];
  for (const rawLine of raw.split("\n")) {
    const line = foldLine(rawLine);
    if (line) lines.push(line);
  }
  return collapseAdjacentStyleWraps(lines.join(" "));
}

export function prepareCues(rawCues: Cue[]): Cue[] {
  const cues: Cue[] = [];
  for (const raw of rawCues) {
    const text = foldText(raw.text);
    if (text) cues.push({ id: raw.id, start_ms: raw.start_ms, end_ms: raw.end_ms, text });
  }
  return cues;
}
