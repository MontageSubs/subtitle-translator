import { HistoryJob, HistorySubtitle, HistoryCue } from "./history";
import { Cue } from '../../utils/types';
import { TranslateJobResponse } from '../../api/workerClient';
import { renderSubtitle } from '../subtitle/subtitleFormat';
import { extractCueMeta, applyCueMeta } from '../subtitle/cueMeta';
import { parseAnTag } from '../subtitle/topAlign';
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

export function buildHistoryCues(cues: TranslateJobResponse["cues"], originalById: Map<number, Cue>): HistoryCue[] {
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
      cueSettings: original?.cueSettings,
      extra: extractCueMeta(original),
    };
  });
}

export function renderHistorySubtitle(sub: HistorySubtitle, isSource: boolean, sourceLang: string, stripSdh: boolean): string {
  const originalById = new Map(historyCuesToCues(sub.cues).map((c) => [c.id, c]));
  const musicTopAlign = Boolean(sub.musicTopAlign);

  if (isSource) {
    const sourceCues = sub.cues.map((c) => ({
      id: c.id,
      start_ms: c.start_ms,
      end_ms: c.end_ms,
      text: c.sourceText,
      translation: null,
      is_music: c.is_music,
    }));
    return renderSubtitle(sub.format, sourceCues, originalById, "monolingual", sub.stacking, musicTopAlign);
  }

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
  return renderSubtitle(sub.format, jobCues, originalById, sub.outputMode, sub.stacking, musicTopAlign);
}

