import { Cue, OutputMode, BilingualStacking, SubtitleFormat } from '../../utils/types';
import { TranslateJobResponse } from '../../api/workerClient';
import { parseSrt } from "./srtParse";
import { renderSrt } from "./srtRender";
import { parseVtt } from "./vttParse";
import { renderVtt } from "./vttRender";
import { parseAss } from "./assParse";
import { renderAss } from "./assRender";

export const ACCEPTED_EXTENSIONS = [".srt", ".vtt", ".ass", ".ssa", ".zip"];

export function detectFormat(filename: string): SubtitleFormat {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".vtt")) return "vtt";
  if (lower.endsWith(".ass") || lower.endsWith(".ssa")) return "ass";
  return "srt";
}

export function parseSubtitle(format: SubtitleFormat, content: string): Cue[] {
  if (format === "vtt") return parseVtt(content);
  if (format === "ass") return parseAss(content);
  return parseSrt(content);
}

export function renderSubtitle(
  format: SubtitleFormat, cues: TranslateJobResponse["cues"], originalById: Map<number, Cue>, mode: OutputMode, stacking: BilingualStacking
): string {
  if (format === "vtt") return renderVtt(cues, originalById, mode, stacking);
  if (format === "ass") return renderAss(cues, originalById, mode, stacking);
  return renderSrt(cues, originalById, mode, stacking);
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

export function withExtension(
  filename: string,
  format: SubtitleFormat,
  targetLang: string,
  sourceLang: string = "en",
  outputMode: OutputMode = "monolingual",
  stacking: BilingualStacking = "translation_top"
): string {
  return buildTranslatedFilename(filename, format, sourceLang, targetLang, outputMode, stacking);
}
