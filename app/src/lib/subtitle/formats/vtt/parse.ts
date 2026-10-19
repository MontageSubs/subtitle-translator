import { Cue } from '../../types';
import { parseVttTopAlign } from '../topAlign';
import { timeToMs } from '../clock';
import { normalizeNewlines, stripAnOverrides, tidyLines } from '../text';

const TIME_LINE_PATTERN = /((?:\d{2}:)?\d{2}:\d{2}\.\d{3})\s*-->\s*((?:\d{2}:)?\d{2}:\d{2}\.\d{3})\s*(.*)$/;
export function parseVtt(content: string): Cue[] {
  const [firstBlock, ...otherBlocks] = normalizeNewlines(content).trim().split(/\n\s*\n/);
  const firstBlockLines = firstBlock.split("\n");
  const hasHeader = firstBlockLines[0].trim().startsWith("WEBVTT");
  const firstTimeLineIdx = firstBlockLines.findIndex((line) => TIME_LINE_PATTERN.test(line.trim()));
  const headerLineCount = !hasHeader ? 0 : firstTimeLineIdx === -1 ? firstBlockLines.length : firstTimeLineIdx;
  const vttHeader = hasHeader ? firstBlockLines.slice(0, headerLineCount).map((line) => line.trim()).join("\n") : "WEBVTT";
  const blocks = [firstBlockLines.slice(headerLineCount).join("\n"), ...otherBlocks].filter((block) => block.trim());

  let accumulatedNonCueBlocks: string[] = [];
  const cues: Cue[] = [];

  for (const block of blocks) {
    const lines = block.split("\n");
    const timeLineIdx = lines.findIndex((line) => TIME_LINE_PATTERN.test(line.trim()));
    if (timeLineIdx === -1) {
      accumulatedNonCueBlocks.push(block.trim());
      continue;
    }
    const timeMatch = TIME_LINE_PATTERN.exec(lines[timeLineIdx].trim())!;
    const identifier = lines.slice(0, timeLineIdx).map((l) => l.trim()).filter(Boolean).join("\n") || undefined;
    const rawText = lines.slice(timeLineIdx + 1).join("\n");
    const text = tidyLines(stripAnOverrides(rawText));
    if (!text) continue;

    const cueSettings = timeMatch[3] || undefined;
    const cue: Cue = {
      id: cues.length + 1,
      start_ms: timeToMs(timeMatch[1]),
      end_ms: timeToMs(timeMatch[2]),
      text,
      topAlign: parseVttTopAlign(cueSettings, rawText),
      cueSettings,
      identifier,
    };

    if (cues.length === 0) {
      cue.vttHeader = vttHeader;
    }
    if (accumulatedNonCueBlocks.length > 0) {
      cue.leadingBlocks = [...accumulatedNonCueBlocks];
      accumulatedNonCueBlocks = [];
    }

    cues.push(cue);
  }

  if (accumulatedNonCueBlocks.length > 0 && cues.length > 0) {
    cues[cues.length - 1].trailingBlocks = [...accumulatedNonCueBlocks];
  }

  return cues;
}
