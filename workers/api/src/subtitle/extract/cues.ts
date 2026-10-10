import type { ProtocolCue } from "../../http/protocol";
import type { Cue } from "../types";
import { collapseAdjacentStyleWraps } from "../common/markup";
import { stripTagsKeepingStyle } from "../styleTags";

const WHITESPACE_PATTERN = /\s+/g;

function foldText(raw: string): string {
  const lines: string[] = [];
  for (const rawLine of raw.split("\n")) {
    const line = stripTagsKeepingStyle(rawLine).replace(WHITESPACE_PATTERN, " ").trim();
    if (line) lines.push(line);
  }
  return collapseAdjacentStyleWraps(lines.join(" "));
}

export function prepareCues(protocolCues: ProtocolCue[]): Cue[] {
  const cues: Cue[] = [];
  for (const raw of protocolCues) {
    const text = foldText(raw.text);
    if (text) cues.push({ id: raw.id, start_ms: raw.start_ms, end_ms: raw.end_ms, text });
  }
  return cues;
}
