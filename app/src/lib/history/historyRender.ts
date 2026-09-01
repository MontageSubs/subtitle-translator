import { HistoryJob, HistorySubtitle, HistoryCue } from "./history";
import { Cue } from '../../utils/types';
import { TranslateJobResponse } from '../../api/workerClient';
import { renderSubtitle } from '../subtitle/subtitleFormat';
import { extractCueMeta, applyCueMeta } from '../subtitle/cueMeta';
import { inferTopPosition } from '../subtitle/positionInfer';

export function historyCuesToCues(cues: HistoryCue[]): Cue[] {
  return cues.map((c) => applyCueMeta(
    { id: c.id, start_ms: c.start_ms, end_ms: c.end_ms, text: c.sourceText, position: c.position || (c.extra as any)?.position, cueSettings: c.cueSettings },
    c.extra
  ));
}

function historyCuesToJobCues(cues: HistoryCue[]): TranslateJobResponse["cues"] {
  return cues.map((c) => ({
    id: c.id,
    start_ms: c.start_ms,
    end_ms: c.end_ms,
    text: c.sourceText,
    translation: c.translatedText || null,
  }));
}

export function buildHistoryCues(cues: TranslateJobResponse["cues"], originalById: Map<number, Cue>): HistoryCue[] {
  return cues.map((c) => {
    const original = originalById.get(c.id);
    return {
      id: c.id,
      start_ms: c.start_ms,
      end_ms: c.end_ms,
      sourceText: c.text,
      translatedText: c.translation ?? "",
      position: inferTopPosition(original, c.text),
      cueSettings: original?.cueSettings,
      extra: extractCueMeta(original),
    };
  });
}

export function renderHistorySubtitle(sub: HistorySubtitle, isSource = false): string {
  const originalById = new Map(historyCuesToCues(sub.cues).map((c) => [c.id, c]));
  if (isSource) {
    const sourceCues = sub.cues.map((c) => ({
      id: c.id,
      start_ms: c.start_ms,
      end_ms: c.end_ms,
      text: c.sourceText,
      translation: null,
    }));
    return renderSubtitle(sub.format, sourceCues, originalById, "monolingual", sub.stacking);
  }
  return renderSubtitle(sub.format, historyCuesToJobCues(sub.cues), originalById, sub.outputMode, sub.stacking);
}

