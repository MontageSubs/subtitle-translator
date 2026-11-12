export const DEFAULT_TIMECODE_SCALE = 1_000_000;

export const BLOCK_COMPRESSION_HEADER_STRIPPING = 3;

export const TEXT_SUBTITLE_CODECS: ReadonlySet<string> = new Set(["S_TEXT/UTF8", "S_TEXT/ASCII", "S_TEXT/SSA", "S_TEXT/ASS", "S_TEXT/WEBVTT"]);

export type TextSubtitleKind = "plain" | "ass" | "webvtt";

export function textSubtitleKindOf(codecId: string): TextSubtitleKind {
  if (codecId === "S_TEXT/SSA" || codecId === "S_TEXT/ASS") return "ass";
  return codecId === "S_TEXT/WEBVTT" ? "webvtt" : "plain";
}
