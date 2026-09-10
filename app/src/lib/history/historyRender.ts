import { HistoryJob, HistorySubtitle, HistoryCue } from "./history";
import { Cue } from '../../utils/types';
import { TranslateJobResponse } from '../../api/workerClient';
import { renderSubtitle } from '../subtitle/subtitleFormat';
import { extractCueMeta, applyCueMeta } from '../subtitle/cueMeta';
import { parseAnTag, AnCornerOrDefault } from '../subtitle/topAlign';
import { applySdhStripping } from '../subtitle/sdh';

export function historyCuesToCues(cues: HistoryCue[]): Cue[] {
  return cues.map((c) => applyCueMeta(
    {
      id: c.id, start_ms: c.start_ms, end_ms: c.end_ms, text: c.sourceText,
      topAlign: c.topAlign || (c.extra as any)?.topAlign || parseAnTag(c.position || (c.extra as any)?.position || ""),
      cueSettings: c.cueSettings,
    },
    c.extra
  ));
}

export function historyCuesToTopAlignOverrides(cues: HistoryCue[]): Map<number, AnCornerOrDefault> {
  const overrides = new Map<number, AnCornerOrDefault>();
  for (const c of cues) {
    if (c.topAlignOverride !== undefined) overrides.set(c.id, c.topAlignOverride);
  }
  return overrides;
}

export function buildHistoryCues(
  cues: TranslateJobResponse["cues"], originalById: Map<number, Cue>, topAlignOverrides?: Map<number, AnCornerOrDefault>
): HistoryCue[] {
  return cues.map((c) => {
    const original = originalById.get(c.id);
    return {
      id: c.id,
      start_ms: c.start_ms,
      end_ms: c.end_ms,
      sourceText: original?.text ?? c.text,
      translatedText: c.translation ?? "",
      topAlign: original?.topAlign,
      is_music: c.is_music,
      topAlignOverride: topAlignOverrides?.get(c.id),
      cueSettings: original?.cueSettings,
      extra: extractCueMeta(original),
    };
  });
}

export function renderHistorySubtitle(sub: HistorySubtitle, isSource: boolean, sourceLang: string, stripSdh: boolean): string {
  const originalById = new Map(historyCuesToCues(sub.cues).map((c) => [c.id, c]));

  if (isSource) {
    const sourceCues = sub.cues.map((c) => ({
      id: c.id,
      start_ms: c.start_ms,
      end_ms: c.end_ms,
      text: c.sourceText,
      translation: null,
      is_music: c.is_music,
    }));
    return renderSubtitle(sub.format, sourceCues, originalById, "monolingual", sub.stacking, false, undefined);
  }

  const musicTopAlign = Boolean(sub.musicTopAlign);
  const topAlignOverrides = historyCuesToTopAlignOverrides(sub.cues);
  const pristineCues: Cue[] = sub.cues.map((c) => ({ id: c.id, start_ms: c.start_ms, end_ms: c.end_ms, text: c.sourceText }));
  const { cues: processedCues } = applySdhStripping(pristineCues, sourceLang, Boolean(stripSdh));
  const processedTextById = new Map(processedCues.map((c) => [c.id, c.text]));
  const jobCues: TranslateJobResponse["cues"] = sub.cues.map((c) => ({
    id: c.id,
    start_ms: c.start_ms,
    end_ms: c.end_ms,
    text: processedTextById.get(c.id) ?? "",
    translation: c.translatedText || null,
    is_music: c.is_music,
  }));
  return renderSubtitle(sub.format, jobCues, originalById, sub.outputMode, sub.stacking, musicTopAlign, topAlignOverrides);
}

