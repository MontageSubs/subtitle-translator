import { Cue } from '../../types';
import { parseAnTag } from '../topAlign';
import { timeToMs } from '../clock';
import { normalizeNewlines, stripAnOverrides, tidyLines } from '../text';

const TIME_LINE_PATTERN = /(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/;
const TIME_LINE_CANDIDATES = [0, 1];

export function parseSrt(content: string): Cue[] {
  const cues: Cue[] = [];
  for (const block of normalizeNewlines(content).trim().split(/\n\s*\n/)) {
    const lines = block.replace(/^\n+|\n+$/g, "").split("\n");
    const timeLineIndex = TIME_LINE_CANDIDATES.find((index) => index < lines.length && TIME_LINE_PATTERN.test(lines[index].trim()));
    if (timeLineIndex === undefined) continue;
    const [, start, end] = TIME_LINE_PATTERN.exec(lines[timeLineIndex].trim())!;
    const rawText = lines.slice(timeLineIndex + 1).join("\n");
    const text = tidyLines(stripAnOverrides(rawText));
    if (text) cues.push({ id: cues.length + 1, start_ms: timeToMs(start), end_ms: timeToMs(end), text, topAlign: parseAnTag(rawText) });
  }
  return cues;
}
