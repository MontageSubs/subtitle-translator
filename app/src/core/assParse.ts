import { Cue } from "./types";

const DIALOGUE_FIELD_COUNT = 10;
const OVERRIDE_BLOCK_PATTERN = /\{[^}]*\}/g;
const BREAK_PATTERN = /\\N|\\n/g;
const HARD_SPACE_PATTERN = /\\h/g;
const WHITESPACE_PATTERN = /[^\S\n]+/g;
const DRAWING_MODE_PATTERN = /\\p[1-9]/;
const ALIGNMENT_PATTERN = /\\an([1-9])/;

function splitDialogueFields(raw: string): string[] {
  const parts: string[] = [];
  let rest = raw;
  for (let i = 0; i < DIALOGUE_FIELD_COUNT - 1; i++) {
    const idx = rest.indexOf(",");
    if (idx === -1) { parts.push(rest); rest = ""; break; }
    parts.push(rest.slice(0, idx));
    rest = rest.slice(idx + 1);
  }
  parts.push(rest);
  while (parts.length < DIALOGUE_FIELD_COUNT) parts.push("");
  return parts;
}

function timeToMs(value: string): number {
  const [hh, mm, rest] = value.trim().split(":");
  const [ss, cs] = rest.split(".");
  return ((Number(hh) * 60 + Number(mm)) * 60 + Number(ss)) * 1000 + Number(cs) * 10;
}

interface DialogueBody {
  text: string;
  position?: string;
  unsupported: boolean;
}

function parseDialogueText(raw: string): DialogueBody {
  let alignment: string | undefined;
  let bold = false;
  let italic = false;
  let unsupported = false;
  const runs: { text: string; bold: boolean; italic: boolean }[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  const pushLiteral = (literal: string) => {
    const normalized = literal.replace(BREAK_PATTERN, "\n").replace(HARD_SPACE_PATTERN, " ");
    if (normalized) runs.push({ text: normalized, bold, italic });
  };

  OVERRIDE_BLOCK_PATTERN.lastIndex = 0;
  while ((match = OVERRIDE_BLOCK_PATTERN.exec(raw))) {
    pushLiteral(raw.slice(cursor, match.index));
    const block = match[0];
    if (DRAWING_MODE_PATTERN.test(block)) unsupported = true;
    const alignMatch = ALIGNMENT_PATTERN.exec(block);
    if (alignMatch && alignment === undefined) alignment = alignMatch[1];
    if (/\\b0\b/.test(block)) bold = false;
    else if (/\\b1\b/.test(block)) bold = true;
    if (/\\i0\b/.test(block)) italic = false;
    else if (/\\i1\b/.test(block)) italic = true;
    cursor = OVERRIDE_BLOCK_PATTERN.lastIndex;
  }
  pushLiteral(raw.slice(cursor));

  const text = runs.map((r) => r.text).join("")
    .split("\n").map((line) => line.replace(WHITESPACE_PATTERN, " ").trim()).filter(Boolean).join("\n");

  const meaningfulRuns = runs.filter((r) => r.text.trim());
  const wholeBold = meaningfulRuns.length > 0 && meaningfulRuns.every((r) => r.bold);
  const wholeItalic = meaningfulRuns.length > 0 && meaningfulRuns.every((r) => r.italic);
  const tags = [alignment !== undefined ? `\\an${alignment}` : "", wholeBold ? "\\b1" : "", wholeItalic ? "\\i1" : ""].filter(Boolean);

  return { text, position: tags.length ? `{${tags.join("")}}` : undefined, unsupported };
}

export function parseAss(content: string): Cue[] {
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/^\uFEFF/, "");
  const lines = normalized.split("\n");
  const cues: Cue[] = [];
  let accumulated: string[] = [];

  for (const line of lines) {
    if (!line.startsWith("Dialogue:")) {
      accumulated.push(line);
      continue;
    }
    const [layer, start, end, style, name, marginL, marginR, marginV, effect, rawText] = splitDialogueFields(line.slice("Dialogue:".length).trim());
    const body = parseDialogueText(rawText);
    if (body.unsupported || !body.text) {
      accumulated.push(line);
      continue;
    }
    const cue: Cue = {
      id: cues.length + 1,
      start_ms: timeToMs(start),
      end_ms: timeToMs(end),
      text: body.text,
      position: body.position,
      cueSettings: [layer, style, name, marginL, marginR, marginV, effect].map((f) => f.trim()).join("|"),
    };
    if (accumulated.length) {
      cue.leadingBlocks = accumulated;
      accumulated = [];
    }
    cues.push(cue);
  }

  if (accumulated.length && cues.length) cues[cues.length - 1].trailingBlocks = accumulated;
  return cues;
}
