import { detectBilingual } from "../bilingual/detectBilingual";
import { parseSubtitle } from "../formats/registry";
import type { SubtitleFormat } from "../types";
import { createId } from "../../../utils/id";
import { detectSourceLanguage, normalizeDetectedCode } from "../../../utils/detect";
import { selectableTagFor } from "./trackLanguage";
import type { SubtitleVariant } from "./types";

export interface TrackMetadata {
  name: string | null;
  isDefault: boolean;
  isForced: boolean;
  isHearingImpaired: boolean;
}

const NO_METADATA: TrackMetadata = { name: null, isDefault: false, isForced: false, isHearingImpaired: false };

const encoder = new TextEncoder();

const fileNameFor = (baseName: string, format: SubtitleFormat): string => `${baseName}.${format}`;

async function contentLanguage(text: string, format: SubtitleFormat): Promise<string | null> {
  const result = await detectSourceLanguage(parseSubtitle(format, text));
  return result?.reliable ? selectableTagFor(normalizeDetectedCode(result.code)) : null;
}

export interface DocumentInput {
  baseName: string;
  format: SubtitleFormat;
  text: string;
  originalFileName?: string;
  originalBytes?: Uint8Array;
}

export async function bilingualVariants(input: DocumentInput, metadata: TrackMetadata = NO_METADATA): Promise<SubtitleVariant[] | null> {
  const cues = parseSubtitle(input.format, input.text);
  const split = await detectBilingual(input.format, cues);
  if (!split) return null;
  const sides = [split.first, split.second].map((side): SubtitleVariant => ({
    id: createId(),
    origin: "side",
    language: side.language,
    trackName: metadata.name,
    format: input.format,
    fileName: fileNameFor(input.baseName, input.format),
    bytes: encoder.encode(side.text),
    cueCount: side.cueCount,
    preview: side.preview,
    ...flagsOf(metadata),
  }));
  const whole: SubtitleVariant = {
    id: createId(),
    origin: "whole",
    language: null,
    trackName: metadata.name,
    format: input.format,
    fileName: input.originalFileName ?? fileNameFor(input.baseName, input.format),
    bytes: input.originalBytes ?? encoder.encode(input.text),
    cueCount: cues.length,
    preview: cues[0]?.text ?? "",
    ...flagsOf(metadata),
  };
  return [...sides, whole];
}

const flagsOf = ({ isDefault, isForced, isHearingImpaired }: TrackMetadata): Pick<SubtitleVariant, "isDefault" | "isForced" | "isHearingImpaired"> => ({ isDefault, isForced, isHearingImpaired });

export async function trackVariants(input: DocumentInput, metadata: TrackMetadata, metadataLanguage: string | null): Promise<SubtitleVariant[]> {
  const cues = parseSubtitle(input.format, input.text);
  if (!cues.length) return [];
  const split = await bilingualVariants(input, metadata);
  if (split) return split;
  return [{
    id: createId(),
    origin: "track",
    language: metadataLanguage ?? (await contentLanguage(input.text, input.format)),
    trackName: metadata.name,
    format: input.format,
    fileName: fileNameFor(input.baseName, input.format),
    bytes: encoder.encode(input.text),
    cueCount: cues.length,
    preview: cues[0].text,
    ...flagsOf(metadata),
  }];
}
