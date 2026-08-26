import { Cue } from "./types";

const TIME_LINE_PATTERN = /((?:\d{2}:)?\d{2}:\d{2}\.\d{3})\s*-->\s*((?:\d{2}:)?\d{2}:\d{2}\.\d{3})\s*(.*)$/;
const WHITESPACE_PATTERN = /[^\S\n]+/g;

function timeToMs(value: string): number {
  const parts = value.split(":");
  const [ss, ms] = parts.pop()!.split(".");
  const mm = parts.pop() ?? "0";
  const hh = parts.pop() ?? "0";
  return ((Number(hh) * 60 + Number(mm)) * 60 + Number(ss)) * 1000 + Number(ms);
}

function normalizeText(raw: string): string {
  return raw
    .split("\n")
    .map((line) => line.replace(WHITESPACE_PATTERN, " ").trim())
    .filter(Boolean)
    .join("\n");
}

export function parseVtt(content: string): Cue[] {
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/^\uFEFF/, "");
  const blocks = normalized.trim().split(/\n\s*\n/);
  if (!blocks.length) return [];

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
    if (!lines.length) continue;
    const timeLineIdx = lines.findIndex((line) => TIME_LINE_PATTERN.test(line.trim()));
    if (timeLineIdx === -1) {
      accumulatedNonCueBlocks.push(block.trim());
      continue;
    }
    const timeMatch = TIME_LINE_PATTERN.exec(lines[timeLineIdx].trim())!;
    const identifier = lines.slice(0, timeLineIdx).map((l) => l.trim()).filter(Boolean).join("\n") || undefined;
    const text = normalizeText(lines.slice(timeLineIdx + 1).join("\n"));
    if (!text) continue;

    const cue: Cue = {
      id: cues.length + 1,
      start_ms: timeToMs(timeMatch[1]),
      end_ms: timeToMs(timeMatch[2]),
      text,
      cueSettings: timeMatch[3] || undefined,
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
