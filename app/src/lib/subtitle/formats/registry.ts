import { Cue, OutputMode, BilingualStacking, SubtitleFormat, CueLayout, TranslatedCue } from '../types';
import { CueRenderContext } from './renderShared';
import { parseSrt } from "./srt/parse";
import { renderSrt } from "./srt/render";
import { parseVtt } from "./vtt/parse";
import { renderVtt } from "./vtt/render";
import { parseAss } from "./ass/parse";
import { renderAssDocument } from "./ass/document";
import { AnCornerOrDefault } from "./topAlign";
import { AssFontPreset } from "./ass/template";
import { wrapLine, shouldWrapTranslation } from "../postprocess/lineWrap";

const DEFAULT_LANGUAGE = "en";
const SRT_TIME_PATTERN = /\d{2}:\d{2}:\d{2}[,. ]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}/;
const VTT_HEADER_PATTERN = /^WEBVTT/i;
const ASS_HEADER_PATTERN = /\[Script Info\]|\[Events\]|Dialogue:/i;

const CONTENT_VALIDATORS: Record<SubtitleFormat, (content: string) => boolean> = {
  vtt: (content) => VTT_HEADER_PATTERN.test(content) || SRT_TIME_PATTERN.test(content),
  ass: (content) => ASS_HEADER_PATTERN.test(content),
  srt: (content) => SRT_TIME_PATTERN.test(content),
};

const PARSERS: Record<SubtitleFormat, (content: string) => Cue[]> = { srt: parseSrt, vtt: parseVtt, ass: parseAss };

export function isValidSubtitleContent(content: string, format?: SubtitleFormat): boolean {
  if (!content?.trim()) return false;
  const normalized = content.replace(/\r\n?/g, "\n").trim();
  if (format) return CONTENT_VALIDATORS[format](normalized);
  return Object.values(CONTENT_VALIDATORS).some((validate) => validate(normalized));
}

export function parseSubtitle(format: SubtitleFormat, content: string): Cue[] {
  if (!isValidSubtitleContent(content, format)) return [];
  return PARSERS[format](content).filter((cue) => cue.text?.trim());
}

export interface SubtitleRenderRequest {
  format: SubtitleFormat;
  cues: TranslatedCue[];
  originalById: Map<number, Cue>;
  mode: OutputMode;
  stacking: BilingualStacking;
  sourceLang: string;
  targetLang: string;
  musicTopAlign?: boolean;
  topAlignOverrides?: Map<number, AnCornerOrDefault>;
  cueLayout?: CueLayout;
  equalBilingualSize?: boolean;
  assFontPreset?: AssFontPreset;
  assCustomPrimarySize?: number;
  assCustomSecondarySize?: number;
  stampComment?: boolean;
}

function withWrappedTranslations(cues: TranslatedCue[], targetLang: string): TranslatedCue[] {
  return cues.map((cue) => (cue.translation ? { ...cue, translation: wrapLine(cue.translation, targetLang, cue.end_ms - cue.start_ms) } : cue));
}

export function renderSubtitle(request: SubtitleRenderRequest): string {
  const { format, cues, mode, stacking, sourceLang, targetLang } = request;
  const cueLayout = request.cueLayout ?? "single";
  const context: CueRenderContext = {
    originalById: request.originalById,
    mode,
    stacking,
    musicTopAlign: request.musicTopAlign ?? false,
    topAlignOverrides: request.topAlignOverrides,
    cueLayout,
    targetLang: targetLang || DEFAULT_LANGUAGE,
  };
  const outputCues = targetLang && shouldWrapTranslation(mode, cueLayout) ? withWrappedTranslations(cues, targetLang) : cues;

  if (format === "vtt") return renderVtt(outputCues, context);
  if (format === "ass") {
    return renderAssDocument(outputCues, context, {
      sourceLang: sourceLang || DEFAULT_LANGUAGE,
      equalBilingualSize: Boolean(request.equalBilingualSize),
      fontPreset: request.assFontPreset,
      customPrimarySize: request.assCustomPrimarySize,
      customSecondarySize: request.assCustomSecondarySize,
      stampComment: request.stampComment ?? true,
    });
  }
  return renderSrt(outputCues, context);
}

export function buildTranslatedFilename(
  originalFilename: string,
  format: SubtitleFormat,
  sourceLang: string,
  targetLang: string,
  outputMode: OutputMode = "monolingual",
  stacking: BilingualStacking = "translation_top"
): string {
  const baseName = (originalFilename || "subtitle").replace(/\.(srt|vtt|ass|ssa|lrc)$/i, "");
  const source = !sourceLang || sourceLang === "auto" ? DEFAULT_LANGUAGE : sourceLang;
  const target = targetLang || "zh";
  if (outputMode !== "bilingual") return `${baseName}.${target}.${format}`;
  return stacking === "original_top" ? `${baseName}.${source}.${target}.${format}` : `${baseName}.${target}.${source}.${format}`;
}
