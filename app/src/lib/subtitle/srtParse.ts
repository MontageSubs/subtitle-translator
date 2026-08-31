import { Cue } from '../../utils/types';

const TIME_LINE_PATTERN = /(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/;
const POSITION_PATTERN = /\{\\an[1-9]\}/;
const WHITESPACE_PATTERN = /[^\S\n]+/g;

function timeToMs(value: string): number {
  const [hh, mm, rest] = value.replace(".", ",").split(":");
  const [ss, ms] = rest.split(",");
  return ((Number(hh) * 60 + Number(mm)) * 60 + Number(ss)) * 1000 + Number(ms);
}

function normalizeText(raw: string): { position?: string; text: string } {
  const stripped = raw.replace(/^\uFEFF/, "");
  const match = POSITION_PATTERN.exec(stripped);
  const text = stripped
    .replace(/\{\\an[1-9]\}/g, "")
    .split("\n")
    .map((line) => line.replace(WHITESPACE_PATTERN, " ").trim())
    .filter(Boolean)
    .join("\n");
  return match ? { position: match[0], text } : { text };
}

export function parseSrt(content: string): Cue[] {
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const cues: Cue[] = [];
  for (const block of normalized.trim().split(/\n\s*\n/)) {
    const lines = block.replace(/^\n+|\n+$/g, "").split("\n");
    if (!lines.length) continue;
    const timeLineIdx = [0, 1].find((idx) => idx < lines.length && TIME_LINE_PATTERN.test(lines[idx].trim()));
    if (timeLineIdx === undefined) continue;
    const timeMatch = TIME_LINE_PATTERN.exec(lines[timeLineIdx].trim())!;
    const { position, text } = normalizeText(lines.slice(timeLineIdx + 1).join("\n"));
    if (text) cues.push({ id: cues.length + 1, start_ms: timeToMs(timeMatch[1]), end_ms: timeToMs(timeMatch[2]), text, position });
  }
  return cues;
}

export const DEFAULT_SCENE_CHANGE_SECONDS = 30;

export function previewChapterCount(cues: Cue[], sceneChangeMs: number): number {
  if (!cues.length) return 0;
  let count = 1;
  let threadEnd = cues[0].end_ms;
  for (let i = 1; i < cues.length; i++) {
    if (cues[i].start_ms - threadEnd > sceneChangeMs) count += 1;
    threadEnd = Math.max(threadEnd, cues[i].end_ms);
  }
  return count;
}
