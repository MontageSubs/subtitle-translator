import { HistoryJob, HistorySubtitle, HistoryCue } from "./history";
import { Cue } from '../../utils/types';
import { TranslateJobResponse } from '../../api/workerClient';
import { renderSubtitle } from '../subtitle/subtitleFormat';
import { extractCueMeta, applyCueMeta } from '../subtitle/cueMeta';

export function historyCuesToCues(cues: HistoryCue[]): Cue[] {
  return cues.map((c) => applyCueMeta(
    { id: c.id, start_ms: c.start_ms, end_ms: c.end_ms, text: c.sourceText, cueSettings: c.cueSettings },
    c.extra
  ));
}

export function historyCuesToJobCues(cues: HistoryCue[]): TranslateJobResponse["cues"] {
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

export function renderHistoryEntry(entry: HistoryJob): string {
  const sub = entry.subtitles[0];
  if (!sub) return "";
  return renderHistorySubtitle(sub, false);
}

export function renderHistoryEntrySource(entry: HistoryJob): string {
  const sub = entry.subtitles[0];
  if (!sub) return "";
  return renderHistorySubtitle(sub, true);
}
