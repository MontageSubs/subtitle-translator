import { Cue } from '../../../../utils/types';
import { parseVttTopAlign } from '../topAlign';
import { parseTimestamp } from '../clock';
import { normalizeNewlines, stripAnOverrides, tidyLines } from '../text';

const TIME_LINE_PATTERN = /((?:\d{2}:)?\d{2}:\d{2}\.\d{3})\s*-->\s*((?:\d{2}:)?\d{2}:\d{2}\.\d{3})\s*(.*)$/;
export function parseVtt(content: string): Cue[] {
  const blocks = normalizeNewlines(content).trim().split(/\n\s*\n/);

  let vttHeader = "WEBVTT";
  let accumulatedNonCueBlocks: string[] = [];
  const cues: Cue[] = [];

  const firstBlockLines = blocks[0].split("\n");
  if (firstBlockLines[0].trim().startsWith("WEBVTT")) {
    vttHeader = firstBlockLines[0].trim();
    if (firstBlockLines.length > 1) {
      const rest = firstBlockLines.slice(1).join("\n").trim();
      if (rest) accumulatedNonCueBlocks.push(rest);
    }
  } else {
    accumulatedNonCueBlocks.push(blocks[0].trim());
  }

  for (const block of blocks.slice(1)) {
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
      start_ms: parseTimestamp(timeMatch[1]),
      end_ms: parseTimestamp(timeMatch[2]),
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
