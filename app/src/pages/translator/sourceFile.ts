import type { SourceChoice } from "../../lib/subtitle/variants/types";
import { parseSubtitle, isValidSubtitleContent } from "../../lib/subtitle/formats/registry";
import { detectFormat } from "../../lib/subtitle/formats/extensions";
import { decodeSubtitleBytes } from "../../lib/subtitle/extraction/encoding";
import type { RawSource } from "../../lib/subtitle/archive";
import type { SubtitleFormat } from "../../lib/subtitle/types";
import { variantOfChoice } from "../../lib/subtitle/variants/variantSource";
import { selectableTagFor } from "../../lib/subtitle/variants/trackLanguage";
import { isKnownSourceLanguage } from "../../utils/detect";
import { createSubtitleFile, ParseErrorReason, SubtitleFile, WorkspaceState } from "./state";

function parseSourceText(text: string, originFormat: SubtitleFormat): Pick<SubtitleFile, "cues" | "parseError" | "parseErrorReason"> {
  const isValid = isValidSubtitleContent(text, originFormat);
  const cues = isValid ? parseSubtitle(originFormat, text) : [];
  const parseErrorReason: ParseErrorReason | null = !isValid ? "invalidFormat" : cues.length === 0 ? "noCues" : null;
  return { cues, parseError: parseErrorReason !== null, parseErrorReason };
}

type SourceText = Pick<SubtitleFile, "filename" | "relativePath" | "sourceFormat" | "rawSourceText">;

export function createFileFromText(state: WorkspaceState, source: SourceText & Partial<Pick<SubtitleFile, "rawSourceBytes" | "choice" | "detectedLang">>): SubtitleFile {
  const originFormat = detectFormat(source.filename);
  return createSubtitleFile(state, { ...source, originFormat, ...parseSourceText(source.rawSourceText ?? "", originFormat) });
}

export function detectedLanguageOf(choice: SourceChoice | undefined): Pick<SubtitleFile, "detectedLang"> {
  const language = choice ? variantOfChoice(choice)?.language : undefined;
  const selectable = language ? selectableTagFor(language) : null;
  return language && selectable && isKnownSourceLanguage(language) ? { detectedLang: selectable } : {};
}

export function createFileFromSource(state: WorkspaceState, source: RawSource): SubtitleFile {
  const { text, format } = decodeSubtitleBytes(source.bytes);
  return createFileFromText(state, {
    filename: source.name,
    relativePath: source.relativePath,
    sourceFormat: format,
    rawSourceText: text,
    rawSourceBytes: source.bytes,
    choice: source.choice,
    ...detectedLanguageOf(source.choice),
  });
}
