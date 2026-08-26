import { HistoryJob, TranslationEngine } from "./history";

let pending: HistoryJob | null = null;

export function requestHistoryRestore(entry: HistoryJob): void {
  pending = entry;
}

export function consumeHistoryRestore(engine: TranslationEngine): HistoryJob | null {
  if (pending?.engine !== engine) return null;
  const entry = pending;
  pending = null;
  return entry;
}
