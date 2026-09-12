import { Cue, OutputMode, BilingualStacking, SubtitleFormat } from '../../utils/types';
import { TranslateJobResponse } from '../../api/workerClient';
import { parseSrt } from "./srtParse";
import { renderSrt } from "./srtRender";
import { parseVtt } from "./vttParse";
import { renderVtt } from "./vttRender";
import { parseAss } from "./assParse";
import { renderAss } from "./assRender";
import { AnCornerOrDefault } from "./topAlign";
import { buildAssHeader, defaultAssFontPlan, AssFontPlan } from "./assTemplate";
import { wrapLine } from "./lineWrap";

export const ACCEPTED_EXTENSIONS = [".srt", ".vtt", ".ass", ".ssa", ".zip"];

export function detectFormat(filename: string): SubtitleFormat {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".vtt")) return "vtt";
  if (lower.endsWith(".ass") || lower.endsWith(".ssa")) return "ass";
  return "srt";
}

const SRT_TIME_PATTERN = /\d{2}:\d{2}:\d{2}[,. ]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}/;
const VTT_HEADER_PATTERN = /^WEBVTT/i;
const ASS_HEADER_PATTERN = /\[Script Info\]|\[Events\]|Dialogue:/i;

export function isValidSubtitleContent(content: string, format?: SubtitleFormat): boolean {
  if (!content || !content.trim()) return false;
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (format === "vtt") {
    return VTT_HEADER_PATTERN.test(normalized) || SRT_TIME_PATTERN.test(normalized);
  }
  if (format === "ass") {
    return ASS_HEADER_PATTERN.test(normalized);
  }
  if (format === "srt") {
    return SRT_TIME_PATTERN.test(normalized);
  }
  return VTT_HEADER_PATTERN.test(normalized) || ASS_HEADER_PATTERN.test(normalized) || SRT_TIME_PATTERN.test(normalized);
}

export function parseSubtitle(format: SubtitleFormat, content: string): Cue[] {
  if (!isValidSubtitleContent(content, format)) return [];
  let cues: Cue[] = [];
  if (format === "vtt") cues = parseVtt(content);
  else if (format === "ass") cues = parseAss(content);
  else cues = parseSrt(content);
  return cues.filter((c) => c && c.text && c.text.trim().length > 0);
}

export interface RenderOptions {
  sourceLang: string;
  targetLang: string;
  equalBilingualSize?: boolean;
}

function withWrappedTranslations(cues: TranslateJobResponse["cues"], targetLang: string): TranslateJobResponse["cues"] {
  return cues.map((c) => (c.translation ? { ...c, translation: wrapLine(c.translation, targetLang) } : c));
}

export function renderSubtitle(
  format: SubtitleFormat, cues: TranslateJobResponse["cues"], originalById: Map<number, Cue>, mode: OutputMode, stacking: BilingualStacking,
  musicTopAlign = false, topAlignOverrides?: Map<number, AnCornerOrDefault>, renderOptions?: RenderOptions
): string {
  const wrappedCues = mode === "monolingual" && renderOptions?.targetLang ? withWrappedTranslations(cues, renderOptions.targetLang) : cues;
  if (format === "vtt") return renderVtt(wrappedCues, originalById, mode, stacking, musicTopAlign, topAlignOverrides);
  if (format === "ass") {
    const bilingual = mode === "bilingual";
    const primaryLang = stacking === "original_top" ? (renderOptions?.sourceLang || "en") : (renderOptions?.targetLang || "en");
    const secondaryLang = stacking === "original_top" ? (renderOptions?.targetLang || "en") : (renderOptions?.sourceLang || "en");
    const fonts: AssFontPlan = defaultAssFontPlan(primaryLang, secondaryLang, bilingual, !!renderOptions?.equalBilingualSize);
    const header = buildAssHeader({ bilingual, fonts });
    const body = renderAss(wrappedCues, originalById, mode, stacking, musicTopAlign, topAlignOverrides, bilingual);
    return `${header}\n${body}`;
  }
  return renderSrt(wrappedCues, originalById, mode, stacking, musicTopAlign, topAlignOverrides);
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
  const cleanSource = (!sourceLang || sourceLang === "auto") ? "en" : sourceLang;
  const cleanTarget = targetLang || "zh";

  if (outputMode === "bilingual") {
    if (stacking === "original_top") {
      return `${baseName}.${cleanSource}.${cleanTarget}.${format}`;
    } else {
      return `${baseName}.${cleanTarget}.${cleanSource}.${format}`;
    }
  }

  return `${baseName}.${cleanTarget}.${format}`;
}

