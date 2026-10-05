import { Cue } from '../../../../utils/types';
import { AnCorner, TopAlign } from '../topAlign';
import { parseAssTimestamp } from '../clock';
import { normalizeNewlines, tidyLines } from '../text';

const DIALOGUE_FIELD_COUNT = 10;
const OVERRIDE_BLOCK_PATTERN = /\{[^}]*\}/g;
const BREAK_PATTERN = /\\N|\\n/g;
const HARD_SPACE_PATTERN = /\\h/g;
const DRAWING_MODE_PATTERN = /\\p[1-9]/;
const ALIGNMENT_PATTERN = /\\an([1-9])/;

function splitDialogueFields(raw: string): string[] {
  const parts = raw.split(",");
  const head = parts.slice(0, DIALOGUE_FIELD_COUNT - 1);
  while (head.length < DIALOGUE_FIELD_COUNT - 1) head.push("");
  return [...head, parts.slice(DIALOGUE_FIELD_COUNT - 1).join(",")];
}

interface DialogueBody {
  text: string;
  topAlign?: TopAlign;
  unsupported: boolean;
}

function parseDialogueText(raw: string): DialogueBody {
  let alignment: string | undefined;
  let unsupported = false;
  const runs: string[] = [];
  let cursor = 0;

  const pushLiteral = (literal: string) => {
    const normalized = literal.replace(BREAK_PATTERN, "\n").replace(HARD_SPACE_PATTERN, " ");
    if (normalized) runs.push(normalized);
  };

  for (const match of raw.matchAll(OVERRIDE_BLOCK_PATTERN)) {
    pushLiteral(raw.slice(cursor, match.index));
    if (DRAWING_MODE_PATTERN.test(match[0])) unsupported = true;
    alignment ??= ALIGNMENT_PATTERN.exec(match[0])?.[1];
    cursor = match.index! + match[0].length;
  }
  pushLiteral(raw.slice(cursor));

  const corner = alignment === undefined ? undefined : Number(alignment);
  const topAlign: TopAlign | undefined = corner !== undefined && corner !== 2 ? { an: corner as AnCorner } : undefined;
  return { text: tidyLines(runs.join("")), topAlign, unsupported };
}

export function parseAss(content: string): Cue[] {
  const lines = normalizeNewlines(content).split("\n");
  const cues: Cue[] = [];
  const headerLines: string[] = [];
  let accumulated: string[] = [];
  let sawDialogue = false;

  for (const line of lines) {
    if (!line.startsWith("Dialogue:")) {
      if (sawDialogue) accumulated.push(line);
      else headerLines.push(line);
      continue;
    }
    sawDialogue = true;
    const [layer, start, end, style, name, marginL, marginR, marginV, effect, rawText] = splitDialogueFields(line.slice("Dialogue:".length).trim());
    const body = parseDialogueText(rawText);
    if (body.unsupported || !body.text) {
      accumulated.push(line);
      continue;
    }
    const cue: Cue = {
      id: cues.length + 1,
      start_ms: parseAssTimestamp(start),
      end_ms: parseAssTimestamp(end),
      text: body.text,
      topAlign: body.topAlign,
      cueSettings: [layer, style, name, marginL, marginR, marginV, effect].map((f) => f.trim()).join("|"),
    };
    if (accumulated.length) {
      cue.leadingBlocks = accumulated;
      accumulated = [];
    }
    cues.push(cue);
  }

  if (accumulated.length && cues.length) cues[cues.length - 1].trailingBlocks = accumulated;
  const header = headerLines.join("\n").trimEnd();
  if (header && cues.length) cues[0].assHeader = header;
  return cues;
}
