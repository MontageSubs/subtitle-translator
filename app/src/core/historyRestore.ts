import { HistoryEntry, TranslationEngine } from "./history";

let pending: HistoryEntry | null = null;

export function requestHistoryRestore(entry: HistoryEntry): void {
  pending = entry;
}

export function consumeHistoryRestore(engine: TranslationEngine): HistoryEntry | null {
  if (pending?.engine !== engine) return null;
  const entry = pending;
  pending = null;
  return entry;
}
