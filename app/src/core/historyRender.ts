import { HistoryEntry } from "./history";
import { Cue } from "./types";
import { TranslateJobResponse } from "./workerClient";
import { renderSubtitle } from "./subtitleFormat";

export function historyEntryToCues(entry: HistoryEntry): Cue[] {
  return entry.cues.map((c) => ({ id: c.id, start_ms: c.start_ms, end_ms: c.end_ms, text: c.sourceText, cueSettings: c.cueSettings }));
}

export function historyEntryToJobCues(entry: HistoryEntry): TranslateJobResponse["cues"] {
  return entry.cues.map((c) => ({ id: c.id, start_ms: c.start_ms, end_ms: c.end_ms, text: c.sourceText, translation: c.translatedText || null }));
}

export function renderHistoryEntry(entry: HistoryEntry): string {
  const originalById = new Map(historyEntryToCues(entry).map((c) => [c.id, c]));
  return renderSubtitle(entry.format, historyEntryToJobCues(entry), originalById, entry.outputMode, entry.stacking);
}
