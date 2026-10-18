import { parseSubtitle, isValidSubtitleContent } from "../../lib/subtitle/formats/registry";
import { detectFormat } from "../../lib/subtitle/formats/extensions";
import { decodeSubtitleBytes } from "../../lib/subtitle/extraction/encoding";
import type { RawSource } from "../../lib/subtitle/archive";
import type { SubtitleFormat } from "../../lib/subtitle/types";
import { createSubtitleFile, ParseErrorReason, SubtitleFile, WorkspaceState } from "./state";

function parseSourceText(text: string, originFormat: SubtitleFormat): Pick<SubtitleFile, "cues" | "parseError" | "parseErrorReason"> {
  const isValid = isValidSubtitleContent(text, originFormat);
  const cues = isValid ? parseSubtitle(originFormat, text) : [];
  const parseErrorReason: ParseErrorReason | null = !isValid ? "invalidFormat" : cues.length === 0 ? "noCues" : null;
  return { cues, parseError: parseErrorReason !== null, parseErrorReason };
}

type SourceText = Pick<SubtitleFile, "filename" | "relativePath" | "sourceFormat" | "rawSourceText">;

export function createFileFromText(state: WorkspaceState, source: SourceText & { rawSourceBytes?: Uint8Array }): SubtitleFile {
  const originFormat = detectFormat(source.filename);
  return createSubtitleFile(state, { ...source, originFormat, ...parseSourceText(source.rawSourceText ?? "", originFormat) });
}

export function createFileFromSource(state: WorkspaceState, source: RawSource): SubtitleFile {
  const { text, format } = decodeSubtitleBytes(source.bytes);
  return createFileFromText(state, { filename: source.name, relativePath: source.relativePath, sourceFormat: format, rawSourceText: text, rawSourceBytes: source.bytes });
}
