import { detectBilingual } from "../bilingual/detectBilingual";
import { parseSubtitle } from "../formats/registry";
import type { SubtitleFormat } from "../types";
import { createId } from "../../../utils/id";
import { detectSourceLanguage, normalizeDetectedCode } from "../../../utils/detect";
import { baseLanguage } from "../common/languageCodes";
import { chineseScriptOf } from "./chineseScript";
import { selectableTagFor, type TrackLanguageHint } from "./trackLanguage";
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
}

const flagsOf = ({ isDefault, isForced, isHearingImpaired }: TrackMetadata): Pick<SubtitleVariant, "isDefault" | "isForced" | "isHearingImpaired"> => ({ isDefault, isForced, isHearingImpaired });

export async function bilingualVariants(input: DocumentInput, metadata: TrackMetadata = NO_METADATA): Promise<SubtitleVariant[] | null> {
  const split = await detectBilingual(input.format, parseSubtitle(input.format, input.text));
  if (!split) return null;
  return [split.first, split.second].map((side): SubtitleVariant => ({
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
}

const NO_HINT: TrackLanguageHint = { primary: null, alternative: null, chineseScriptUnspecified: false };

async function settleLanguage(input: DocumentInput, hint: TrackLanguageHint): Promise<string | null> {
  let language = hint.primary;
  if (hint.alternative) {
    const content = await contentLanguage(input.text, input.format);
    if (content && baseLanguage(content) === baseLanguage(hint.alternative)) language = hint.alternative;
    else language ??= content;
  }
  language ??= await contentLanguage(input.text, input.format);
  const needsScript = language !== null && baseLanguage(language) === "zh" && (hint.chineseScriptUnspecified || hint.primary === null);
  return needsScript ? chineseScriptOf(input.text) ?? language : language;
}

export async function trackVariants(input: DocumentInput, metadata: TrackMetadata, hint: TrackLanguageHint = NO_HINT): Promise<SubtitleVariant[]> {
  const cues = parseSubtitle(input.format, input.text);
  if (!cues.length) return [];
  const split = await bilingualVariants(input, metadata);
  if (split) return split;
  return [{
    id: createId(),
    origin: "track",
    language: await settleLanguage(input, hint),
    trackName: metadata.name,
    format: input.format,
    fileName: fileNameFor(input.baseName, input.format),
    bytes: encoder.encode(input.text),
    cueCount: cues.length,
    preview: cues[0].text,
    ...flagsOf(metadata),
  }];
}
