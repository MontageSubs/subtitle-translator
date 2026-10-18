import { isDebugEnabled } from "./level";

export type FailureScope = "batch" | "chunk" | "context" | "glossary";
export type RetryStage = "missing" | "script" | "window" | "isolated" | "leak";
export type RepairKind = "glossary" | "style" | "latin";

export interface BatchIssue {
  index: number;
  attempts?: number;
  missing: number[];
}

export type EngineEvent =
  | { e: "plan"; provider: string; batches: number[][] }
  | { e: "cap"; kept: number; total: number }
  | { e: "skip"; cues: number[] }
  | { e: "batches"; total: number; items: BatchIssue[] }
  | { e: "fail"; scope: FailureScope; code: string; count: number; at: number[] }
  | { e: "retry"; stage: RetryStage; cues: number[]; unresolved: number[]; rounds?: number }
  | { e: "repair"; kind: RepairKind; cues: number[]; words: number }
  | { e: "budget" }
  | { e: "merge"; total: number; missing: number[]; splits: number[] };

interface FailureTally {
  scope: FailureScope;
  code: string;
  count: number;
  at: number[];
}

interface RepairTally {
  cues: number[];
  words: number;
}

export class EngineTrace {
  private pending: EngineEvent[] = [];
  private batchTotal = 0;
  private batchIssues: BatchIssue[] = [];
  private failures = new Map<string, FailureTally>();
  private repairs = new Map<RepairKind, RepairTally>();

  emit(event: EngineEvent): void {
    this.pending.push(event);
  }

  batch(index: number, total: number, missing: number[], attempts?: number): void {
    this.batchTotal = total;
    this.batchIssues.push({ index, attempts, missing });
  }

  fail(scope: FailureScope, code: string, batchIndex?: number): void {
    const key = `${scope}|${code}`;
    const tally = this.failures.get(key) ?? { scope, code, count: 0, at: [] };
    tally.count++;
    if (batchIndex !== undefined && !tally.at.includes(batchIndex)) tally.at.push(batchIndex);
    this.failures.set(key, tally);
  }

  repair(kind: RepairKind, cues: number[], words = 0): void {
    const tally = this.repairs.get(kind);
    if (!tally) {
      this.repairs.set(kind, { cues, words });
      return;
    }
    for (const cue of cues) tally.cues.push(cue);
    tally.words += words;
  }

  take(): EngineEvent[] {
    const events = this.pending;
    this.pending = [];
    if (this.batchIssues.length) events.push({ e: "batches", total: this.batchTotal, items: this.batchIssues });
    for (const { scope, code, count, at } of this.failures.values()) events.push({ e: "fail", scope, code, count, at });
    for (const [kind, { cues, words }] of this.repairs) events.push({ e: "repair", kind, cues, words });
    this.batchIssues = [];
    this.failures.clear();
    this.repairs.clear();
    return events;
  }
}

export const createEngineTrace = (streaming: boolean): EngineTrace | null => (streaming || isDebugEnabled(2) ? new EngineTrace() : null);
