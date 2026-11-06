import { SEQUENTIAL_DEPTH } from "../depth";
import type { CandidateCollector } from "../candidates";
import type { RecognitionProfile } from "../profile";
import type { EntityRecognizer, ScanHandlers, ScanState } from "../planning/scan";
import { collectScriptWords, MAX_SCAN_UNITS, processScan, type DetectorState } from "./detector";
import type { WordPriors } from "./priors";
import { createKnowledgeTable, type KnowledgeSnapshot } from "./table";

export interface SequentialState {
  readonly detector: DetectorState;
  nextUnit: number;
}

export interface SequentialSnapshot {
  nextUnit: number;
  knowledge: KnowledgeSnapshot;
}

export function createSequentialState(scan: ScanState, collector: CandidateCollector, profile: RecognitionProfile, priors: WordPriors, restored?: SequentialSnapshot): SequentialState {
  const nextUnit = Math.min(restored?.nextUnit ?? 0, scan.sentences.length);
  return {
    nextUnit,
    detector: {
      profile,
      table: createKnowledgeTable(restored?.knowledge),
      collector,
      scriptWords: collectScriptWords(scan.sentences.map(({ tokens }) => tokens), profile),
      documentCased: scan.ledger.documentCased,
      seen: new Set(scan.sentences.slice(0, nextUnit).map(({ unit }) => unit.text)),
      priors,
    },
  };
}

export const snapshotSequential = ({ nextUnit, detector }: SequentialState): SequentialSnapshot => ({ nextUnit, knowledge: detector.table.snapshot() });

export async function runSequential(state: SequentialState, scan: ScanState, recognize: EntityRecognizer, handlers: ScanHandlers): Promise<void> {
  const total = scan.sentences.length;
  if (scan.finishedDepth !== null) Object.assign(scan, { finishedDepth: null, progress: 0 });
  while (state.nextUnit < total && !handlers.shouldStop()) {
    const { consumed } = await processScan(state.detector, scan.sentences.slice(state.nextUnit, state.nextUnit + MAX_SCAN_UNITS), recognize, handlers);
    state.nextUnit += consumed;
    scan.progress = Math.max(scan.progress, Math.min(state.nextUnit / total, 0.999));
    handlers.onAdvance(scan.progress);
  }
  if (handlers.shouldStop()) return;
  scan.finishedDepth = SEQUENTIAL_DEPTH;
  scan.progress = 1;
  handlers.onAdvance(1);
}
