import type { TranslateJobResponse } from "../../api/translation/types";
import { HistoryJob, HistorySubtitle, HistoryCue } from "./history";
import { Cue, TranslatedCue } from '../subtitle/types';
import { renderSubtitle } from '../subtitle/formats/registry';
import { AnCornerOrDefault } from '../subtitle/formats/topAlign';
import { packCueMeta, unpackCueMeta } from './cueMetaCodec';
import { applySdhStripping } from '../subtitle/extraction/sdh';
import { DEFAULT_CREDIT_ENABLED } from '../subtitle/formats/credit';

export function historyCuesToCues(cues: HistoryCue[]): Cue[] {
  return cues.map((cue) => ({ id: cue.id, start_ms: cue.start_ms, end_ms: cue.end_ms, text: cue.sourceText, ...unpackCueMeta(cue) }));
}

export function historyCuesToTopAlignOverrides(cues: HistoryCue[]): Map<number, AnCornerOrDefault> {
  const overrides = new Map<number, AnCornerOrDefault>();
  for (const cue of cues) {
    if (cue.topAlignOverride !== undefined) overrides.set(cue.id, cue.topAlignOverride);
  }
  return overrides;
}

export function buildHistoryCues(
  cues: TranslatedCue[], originalById: Map<number, Cue>, topAlignOverrides?: Map<number, AnCornerOrDefault>
): HistoryCue[] {
  return cues.map((cue) => {
    const original = originalById.get(cue.id);
    return {
      id: cue.id,
      start_ms: cue.start_ms,
      end_ms: cue.end_ms,
      sourceText: original?.text ?? cue.text,
      translatedText: cue.translation ?? "",
      is_music: cue.is_music,
      verbatim: cue.verbatim,
      topAlignOverride: topAlignOverrides?.get(cue.id),
      ...packCueMeta(original),
    };
  });
}

function toJobCue(cue: HistoryCue, text: string, translation: string | null): TranslatedCue {
  return { id: cue.id, start_ms: cue.start_ms, end_ms: cue.end_ms, text, translation, is_music: cue.is_music, verbatim: cue.verbatim };
}

export function historySubtitleToJobCues(subtitle: HistorySubtitle, sourceLang: string, stripSdh: boolean): TranslatedCue[] {
  const pristine: Cue[] = subtitle.cues.map(({ id, start_ms, end_ms, sourceText }) => ({ id, start_ms, end_ms, text: sourceText }));
  const processedTextById = new Map(applySdhStripping(pristine, sourceLang, stripSdh).cues.map((cue) => [cue.id, cue.text]));
  return subtitle.cues.map((cue) => toJobCue(cue, processedTextById.get(cue.id) ?? "", cue.translatedText || null));
}

export const subtitleSourceLang = (job: HistoryJob, subtitle: HistorySubtitle): string => subtitle.sourceLang ?? job.sourceLang;

export function historySubtitleToJobResult(job: HistoryJob, subtitle: HistorySubtitle): TranslateJobResponse {
  const sourceLang = subtitleSourceLang(job, subtitle);
  const cues = historySubtitleToJobCues(subtitle, sourceLang, Boolean(job.stripSdh));
  const missingCues = cues.filter((cue) => cue.translation === null && !cue.verbatim && !cue.is_music).map((cue) => cue.id);
  return {
    success: true,
    resolved_source_lang: sourceLang,
    provider: job.provider,
    cues,
    approx_splits: [],
    missing_count: missingCues.length,
    missing_cues: missingCues,
    quality_warnings: [],
  };
}

export function renderHistorySubtitle(subtitle: HistorySubtitle, isSource: boolean, sourceLang: string, targetLang: string, stripSdh: boolean): string {
  const originalById = new Map(historyCuesToCues(subtitle.cues).map((cue) => [cue.id, cue]));
  const base = { format: subtitle.format, originalById, stacking: subtitle.stacking, sourceLang, targetLang };

  if (isSource) {
    return renderSubtitle({
      ...base,
      cues: subtitle.cues.map((cue) => toJobCue(cue, cue.sourceText, null)),
      mode: "monolingual",
      stampComment: false,
    });
  }

  return renderSubtitle({
    ...base,
    cues: historySubtitleToJobCues(subtitle, sourceLang, stripSdh),
    mode: subtitle.outputMode,
    musicTopAlign: Boolean(subtitle.musicTopAlign),
    topAlignOverrides: historyCuesToTopAlignOverrides(subtitle.cues),
    cueLayout: subtitle.cueLayout,
    credit: subtitle.credit ?? DEFAULT_CREDIT_ENABLED,
  });
}
