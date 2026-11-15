import type { Cue, SubtitleFormat } from "../types";
import { msToAssTime, msToSrtTime, msToVttTime } from "../formats/clock";
import { lineLevelTags, renderTaggedText } from "../formats/ass/overrides";
import { renderAnTag } from "../formats/topAlign";

const DEFAULT_VTT_HEADER = "WEBVTT";
const DEFAULT_ASS_SETTINGS = ["0", "Default", "", "0", "0", "0", ""];
const DEFAULT_ASS_HEADER = "[Script Info]\nScriptType: v4.00+\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,1,2,10,10,20,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text";

function renderSrt(cues: readonly Cue[]): string {
  return `${cues.map((cue, index) => `${index + 1}\n${msToSrtTime(cue.start_ms)} --> ${msToSrtTime(cue.end_ms)}\n${cue.text}`).join("\n\n")}\n`;
}

function renderVtt(cues: readonly Cue[], header: string | undefined): string {
  const blocks = cues.map((cue) => {
    const identifier = cue.identifier ? `${cue.identifier}\n` : "";
    const settings = cue.cueSettings ? ` ${cue.cueSettings}` : "";
    return `${identifier}${msToVttTime(cue.start_ms)} --> ${msToVttTime(cue.end_ms)}${settings}\n${cue.text}`;
  });
  return `${header || DEFAULT_VTT_HEADER}\n\n${blocks.join("\n\n")}\n`;
}

function renderAss(cues: readonly Cue[], header: string | undefined): string {
  const events = cues.map((cue) => {
    const stored = cue.cueSettings?.includes("|") ? cue.cueSettings.split("|") : DEFAULT_ASS_SETTINGS;
    const [layer, style, name, marginL, marginR, marginV, effect] = DEFAULT_ASS_SETTINGS.map((fallback, index) => stored[index] ?? fallback);
    const body = `${renderAnTag(cue.topAlign)}${lineLevelTags(cue)}${renderTaggedText(cue.text, cue, false)}`;
    return `Dialogue: ${layer.trim() || "0"},${msToAssTime(cue.start_ms)},${msToAssTime(cue.end_ms)},${style},${name},${marginL},${marginR},${marginV},${effect},${body}`;
  });
  return `${header || DEFAULT_ASS_HEADER}\n${events.join("\n")}\n`;
}

export interface SideHeaders {
  assHeader?: string;
  vttHeader?: string;
}

export function serializeSideCues(format: SubtitleFormat, cues: readonly Cue[], headers: SideHeaders): string {
  if (format === "ass") return renderAss(cues, headers.assHeader);
  return format === "vtt" ? renderVtt(cues, headers.vttHeader) : renderSrt(cues);
}
