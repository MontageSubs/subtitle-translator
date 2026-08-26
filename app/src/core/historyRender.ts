import { HistoryJob, HistorySubtitle, HistoryCue } from "./history";
import { Cue } from "./types";
import { TranslateJobResponse } from "./workerClient";
import { renderSubtitle } from "./subtitleFormat";

export function historyCuesToCues(cues: HistoryCue[]): Cue[] {
  return cues.map((c) => ({
    id: c.id,
    start_ms: c.start_ms,
    end_ms: c.end_ms,
    text: c.sourceText,
    cueSettings: c.cueSettings,
  }));
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
