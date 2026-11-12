import { msToAssTime, msToSrtTime, msToVttTime } from "../../formats/clock";
import type { SubtitleFormat } from "../../types";
import { DecodedBlock, decodeBlocks } from "./blockDecoding";
import type { RawBlock } from "./clusterScan";
import { textSubtitleKindOf } from "./trackCodecs";
import type { MatroskaTrack } from "./tracks";

export interface TrackDocument {
  format: SubtitleFormat;
  text: string;
}

const FALLBACK_CUE_MS = 2000;
const MIN_CUE_MS = 1;
const DEFAULT_ASS_EVENTS = "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text";
const BYTE_ORDER_MARK = /^﻿/;

const normalizeNewlines = (text: string): string => text.replace(/\r\n?/g, "\n").trim();

function timedBlocks(blocks: DecodedBlock[]): { startMs: number; endMs: number; text: string }[] {
  const ordered = blocks.map((block, index) => ({ block, index })).sort((a, b) => a.block.startMs - b.block.startMs || a.index - b.index).map(({ block }) => block);
  return ordered.flatMap((block, index) => {
    const text = normalizeNewlines(block.text);
    if (!text) return [];
    const nextStart = ordered[index + 1]?.startMs;
    const fallbackEnd = Math.min(block.startMs + FALLBACK_CUE_MS, nextStart !== undefined && nextStart > block.startMs ? nextStart : Infinity);
    return [{ startMs: block.startMs, endMs: Math.max(block.startMs + MIN_CUE_MS, block.durationMs === null ? fallbackEnd : block.startMs + block.durationMs), text }];
  });
}

function renderPlain(blocks: DecodedBlock[], timestamp: (ms: number) => string, prefix: string, numbered: boolean): string {
  const cues = timedBlocks(blocks).map((cue, index) => `${numbered ? `${index + 1}\n` : ""}${timestamp(cue.startMs)} --> ${timestamp(cue.endMs)}\n${cue.text}`);
  return `${prefix}${cues.join("\n\n")}\n`;
}

function renderAss(track: MatroskaTrack, blocks: DecodedBlock[]): string {
  const privateText = track.codecPrivate ? new TextDecoder("utf-8").decode(track.codecPrivate).replace(BYTE_ORDER_MARK, "") : "";
  const normalized = privateText.replace(/\r\n?/g, "\n").trimEnd();
  const header = /\[Events\]/i.test(normalized) ? normalized : `${normalized}${normalized ? "\n\n" : "[Script Info]\nScriptType: v4.00+\n\n"}${DEFAULT_ASS_EVENTS}`;
  const events = blocks.flatMap((block) => {
    const readOrderEnd = block.text.indexOf(",");
    const layerEnd = block.text.indexOf(",", readOrderEnd + 1);
    if (readOrderEnd < 0 || layerEnd < 0) return [];
    const layer = block.text.slice(readOrderEnd + 1, layerEnd);
    return [`Dialogue: ${layer},${msToAssTime(block.startMs)},${msToAssTime(block.startMs + (block.durationMs ?? FALLBACK_CUE_MS))},${block.text.slice(layerEnd + 1).replace(/\r?\n/g, "\\N")}`];
  });
  return `${header}\n${events.join("\n")}\n`;
}

export async function buildTrackDocument(track: MatroskaTrack, blocks: readonly RawBlock[]): Promise<TrackDocument | null> {
  const decoded = await decodeBlocks(blocks, track.compression);
  if (!decoded.length) return null;
  const kind = textSubtitleKindOf(track.codecId);
  if (kind === "ass") return { format: "ass", text: renderAss(track, decoded) };
  if (kind === "webvtt") return { format: "vtt", text: renderPlain(decoded, msToVttTime, "WEBVTT\n\n", false) };
  return { format: "srt", text: renderPlain(decoded, msToSrtTime, "", true) };
}
