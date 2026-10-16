import { parseSubtitle, isValidSubtitleContent } from "../../lib/subtitle/formats/registry";
import { detectFormat } from "../../lib/subtitle/formats/extensions";
import { decodeSubtitleBytes } from "../../lib/subtitle/extraction/encoding";
import type { RawSource } from "../../lib/subtitle/archive";
import { createSubtitleFile, ParseErrorReason, SubtitleFile, WorkspaceState } from "./state";

export function createFileFromSource(state: WorkspaceState, source: RawSource): SubtitleFile {
  const { text, format: sourceFormat } = decodeSubtitleBytes(source.bytes);
  const originFormat = detectFormat(source.name);
  const isValid = isValidSubtitleContent(text, originFormat);
  const cues = isValid ? parseSubtitle(originFormat, text) : [];
  const parseErrorReason: ParseErrorReason | null = !isValid ? "invalidFormat" : cues.length === 0 ? "noCues" : null;
  return createSubtitleFile(state, {
    filename: source.name,
    relativePath: source.relativePath,
    sourceFormat,
    originFormat,
    rawSourceText: text,
    rawSourceBytes: source.bytes,
    cues,
    parseError: parseErrorReason !== null,
    parseErrorReason,
  });
}
