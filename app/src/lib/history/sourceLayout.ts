import { Cue, SubtitleFormat } from "../subtitle/types";
import { msToAssTime, msToSrtTime, msToVttTime } from "../subtitle/formats/clock";
import { normalizeNewlines } from "../subtitle/formats/text";
import { renderTaggedText } from "../subtitle/formats/ass/overrides";
import { decodeSubtitleBytes, encodeSubtitleText, SourceFormat } from "../subtitle/extraction/encoding";
import { historyCuesToCues } from "./historyRender";
import type { HistorySubtitle } from "./history";

const SLOT_OPEN = "\u0001";
const SLOT_CLOSE = "\u0002";
const SLOT_PATTERN = /\u0001(\d+)([a-z]\d*)\u0002/g;
const ASS_LINE_BREAK = "\\N";
const DEFAULT_SOURCE_FORMAT: SourceFormat = { encoding: "utf-8", bom: false, newline: "lf" };

const TIME_FORMATTERS: Record<SubtitleFormat, (ms: number) => string> = { srt: msToSrtTime, vtt: msToVttTime, ass: msToAssTime };

type Slot = readonly [key: string, value: string | undefined];

function cueSettingsSlot(cue: Cue, format: SubtitleFormat): string | undefined {
  if (format === "ass") return cue.cueSettings?.includes("|") ? cue.cueSettings.split("|").slice(1).join(",") : undefined;
  return cue.cueSettings;
}

function textSlots(cue: Cue, format: SubtitleFormat): Slot[] {
  if (format !== "ass") return [["t", cue.text]];
  if (cue.assTags) return [["m", renderTaggedText(cue.text, cue)]];
  return [["t", cue.text], ["n", cue.text.split("\n").join(ASS_LINE_BREAK)]];
}

function cueSlots(cue: Cue, index: number, format: SubtitleFormat): Slot[] {
  const formatTime = TIME_FORMATTERS[format];
  return [
    ["h", index === 0 ? cue.assHeader ?? cue.vttHeader : undefined],
    ...(cue.leadingBlocks ?? []).map((block, position): Slot => [`l${position}`, block]),
    ["i", cue.identifier],
    ["s", formatTime(cue.start_ms)],
    ["e", formatTime(cue.end_ms)],
    ["c", cueSettingsSlot(cue, format)],
    ...textSlots(cue, format),
    ...(cue.trailingBlocks ?? []).map((block, position): Slot => [`r${position}`, block]),
  ];
}

export function buildSourceLayout(rawText: string, cues: Cue[], format: SubtitleFormat): string | undefined {
  const text = normalizeNewlines(rawText);
  if (text.includes(SLOT_OPEN) || text.includes(SLOT_CLOSE)) return undefined;
  let cursor = 0;
  let layout = "";
  cues.forEach((cue, index) => {
    for (const [key, value] of cueSlots(cue, index, format)) {
      const position = value ? text.indexOf(value, cursor) : -1;
      if (position < 0) continue;
      layout += `${text.slice(cursor, position)}${SLOT_OPEN}${index}${key}${SLOT_CLOSE}`;
      cursor = position + value!.length;
    }
  });
  return layout + text.slice(cursor);
}

function expandSourceLayout(layout: string, cues: Cue[], format: SubtitleFormat): string {
  const slotsByCue = cues.map((cue, index) => new Map(cueSlots(cue, index, format)));
  return layout.replace(SLOT_PATTERN, (_, index: string, key: string) => slotsByCue[Number(index)]?.get(key) ?? "");
}

export function restoreSourceFile(subtitle: HistorySubtitle): { text: string; bytes: Uint8Array } | null {
  if (!subtitle.sourceLayout) return null;
  const text = expandSourceLayout(subtitle.sourceLayout, historyCuesToCues(subtitle.cues), subtitle.originFormat ?? subtitle.format);
  const bytes = encodeSubtitleText(text, subtitle.sourceFormat ?? DEFAULT_SOURCE_FORMAT);
  return { text: decodeSubtitleBytes(bytes).text, bytes };
}
