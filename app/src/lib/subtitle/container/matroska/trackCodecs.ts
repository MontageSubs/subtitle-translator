export const DEFAULT_TIMECODE_SCALE = 1_000_000;

export const BLOCK_COMPRESSION_HEADER_STRIPPING = 3;

const PLAIN_CODECS = ["S_TEXT/UTF8", "S_TEXT/UTF-8", "S_TEXT/ASCII"];
const ASS_CODECS = ["S_TEXT/SSA", "S_TEXT/ASS", "S_SSA", "S_ASS"];
const WEBVTT_CODECS = ["S_TEXT/WEBVTT"];
const WEBM_WEBVTT_PREFIX = "D_WEBVTT/";
const WEBM_WEBVTT_CAPTIONS = "D_WEBVTT/CAPTIONS";
const WEBM_WEBVTT_TEXT_KINDS = ["D_WEBVTT/SUBTITLES", WEBM_WEBVTT_CAPTIONS];

export const TEXT_SUBTITLE_CODECS: ReadonlySet<string> = new Set([...PLAIN_CODECS, ...ASS_CODECS, ...WEBVTT_CODECS, ...WEBM_WEBVTT_TEXT_KINDS]);

export type TextSubtitleKind = "plain" | "ass" | "webvtt" | "webmWebvtt";

export function textSubtitleKindOf(codecId: string): TextSubtitleKind {
  if (ASS_CODECS.includes(codecId)) return "ass";
  if (codecId.startsWith(WEBM_WEBVTT_PREFIX)) return "webmWebvtt";
  return WEBVTT_CODECS.includes(codecId) ? "webvtt" : "plain";
}

export const isCaptionsCodec = (codecId: string): boolean => codecId === WEBM_WEBVTT_CAPTIONS;
