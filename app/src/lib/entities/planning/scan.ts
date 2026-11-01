import type { NerEntity } from "../../models/ner/decode";
import type { CandidateCollector } from "../candidates";
import type { RecognitionProfile } from "../profile";
import { createEvidenceStore, remainingNeed, type EvidenceStore } from "./evidence";
import { isCaseInformative, type Ledger, type SentenceEntry } from "./ledger";
import { roundSizeFor, selectRound, totalNeed, type NeedOf } from "./planner";

export type EntityRecognizer = (texts: readonly string[]) => Promise<NerEntity[][]>;

export interface ScanState {
  readonly profile: RecognitionProfile;
  readonly sentences: readonly SentenceEntry[];
  readonly ledger: Ledger;
  readonly collector: CandidateCollector;
  readonly evidence: EvidenceStore;
  readonly probed: Set<number>;
  budgetUsed: number;
  auditDone: boolean;
  finishedBudget: number | null;
  spent: number;
  progress: number;
}

export interface ScanHandlers {
  knownKeys(): ReadonlySet<string>;
  onTerms(sources: string[]): void;
  onAdvance(fraction: number): void;
  shouldStop(): boolean;
}

export interface ScanSnapshot {
  probed: number[];
  evidence: ReturnType<EvidenceStore["snapshot"]>;
  budgetUsed: number;
  auditDone: boolean;
  finishedBudget: number | null;
  spent: number;
  progress: number;
}

export const BATCH_SIZE = 8;
const SHORT_PROBE_TOKENS = 4;
const CONTEXT_SENTENCES = 2;
const AUDIT_SHARE = 0.015;
const MIN_AUDIT_SENTENCES = 3;
export const MAX_BUDGET_PERCENT = 15;

export const DEFAULT_BUDGET_PERCENT = 5;
export const clampBudget = (percent: number): number => Math.min(MAX_BUDGET_PERCENT, Math.max(0, Math.round(percent)));

export function createScanState(profile: RecognitionProfile, sentences: readonly SentenceEntry[], ledger: Ledger, collector: CandidateCollector, restored?: ScanSnapshot): ScanState {
  return {
    profile,
    sentences,
    ledger,
    collector,
    evidence: createEvidenceStore(restored?.evidence),
    probed: new Set(restored?.probed),
    budgetUsed: restored?.budgetUsed ?? 0,
    auditDone: restored?.auditDone ?? false,
    finishedBudget: restored?.finishedBudget ?? null,
    spent: restored?.spent ?? 0,
    progress: restored?.progress ?? 0,
  };
}

export const snapshotScan = (state: ScanState): ScanSnapshot => ({
  probed: [...state.probed],
  evidence: state.evidence.snapshot(),
  budgetUsed: state.budgetUsed,
  auditDone: state.auditDone,
  finishedBudget: state.finishedBudget,
  spent: state.spent,
  progress: state.progress,
});

const mainNeed = (state: ScanState): NeedOf => (key) => (state.ledger.tierOf(key) === "A" ? remainingNeed(state.ledger.entries.get(key)!, state.evidence.of(key)) : 0);

const budgetNeed = (state: ScanState): NeedOf => (key) => (state.ledger.tierOf(key) === "B" && state.evidence.of(key).probes === 0 ? 1 : 0);

const budgetLimit = (state: ScanState, percent: number): number => Math.max(0, Math.ceil((state.ledger.groups.length * clampBudget(percent)) / 100) - state.budgetUsed);

function auditKeys(state: ScanState): { keysOf: string[][]; needOf: NeedOf; limit: number } {
  const limit = Math.max(MIN_AUDIT_SENTENCES, Math.ceil(state.ledger.groups.length * AUDIT_SHARE));
  const keys = new Set(state.ledger.excludedFrequent(limit * 2));
  const keysOf = state.ledger.groups.map(() => [] as string[]);
  for (const key of keys) for (const group of state.ledger.entries.get(key)!.groups) keysOf[group].push(key);
  return { keysOf, needOf: (key) => (keys.has(key) && state.evidence.of(key).probes === 0 ? 1 : 0), limit };
}

function probeText(state: ScanState, groupIndex: number): { text: string; offset: number } {
  const { sentences, profile, ledger } = state;
  const index = ledger.groups[groupIndex].index;
  const target = sentences[index];
  if (target.tokens.length >= SHORT_PROBE_TOKENS) return { text: target.unit.text, offset: 0 };
  let prefix = "";
  for (let back = 1; back <= CONTEXT_SENTENCES && index - back >= 0; back++) {
    const candidate = sentences[index - back].unit.text;
    if (prefix.length + candidate.length + target.unit.text.length >= profile.maxUnitChars) break;
    prefix = candidate + profile.joiner + prefix;
  }
  return { text: prefix + target.unit.text, offset: prefix.length };
}

const overlaps = (start: number, end: number, entity: NerEntity): boolean => start < entity.end && end > entity.start;

function absorb(state: ScanState, groupIndex: number, keys: readonly string[], entities: readonly NerEntity[], known: ReadonlySet<string>, handlers: ScanHandlers): void {
  const entry = state.sentences[state.ledger.groups[groupIndex].index];
  const informative = isCaseInformative(entry.unit.text, state.profile);
  const { fresh, strong } = state.collector.add(entities, known, informative);
  const accepted = entities.filter((_, position) => strong[position]);
  const wanted = new Set(keys);
  const verdicts = new Map<string, string | null>();
  for (const token of entry.tokens) {
    if (!wanted.has(token.key)) continue;
    const hit = accepted.find((entity) => overlaps(token.start, token.end, entity));
    if (hit) verdicts.set(token.key, hit.type);
    else if (!verdicts.has(token.key)) verdicts.set(token.key, null);
  }
  for (const [key, type] of verdicts) {
    state.evidence.record(key, type !== null, type);
    state.spent += 1;
  }
  state.probed.add(groupIndex);
  if (fresh.length) handlers.onTerms(fresh.map(({ source }) => source));
}

async function probeGroups(state: ScanState, groups: readonly number[], keysOf: readonly (readonly string[])[], recognize: EntityRecognizer, handlers: ScanHandlers): Promise<void> {
  for (let offset = 0; offset < groups.length; offset += BATCH_SIZE) {
    if (handlers.shouldStop()) return;
    const batch = groups.slice(offset, offset + BATCH_SIZE);
    const probes = batch.map((group) => probeText(state, group));
    const results = await recognize(probes.map(({ text }) => text));
    const known = handlers.knownKeys();
    batch.forEach((group, position) => {
      const { offset: shift } = probes[position];
      const entities = results[position].filter((entity) => entity.start >= shift).map((entity) => ({ ...entity, start: entity.start - shift, end: entity.end - shift }));
      absorb(state, group, keysOf[group], entities, known, handlers);
    });
    handlers.onAdvance(fractionDone(state));
  }
}

function fractionDone(state: ScanState): number {
  const remaining = totalNeed(state.ledger.entries.keys(), mainNeed(state)) + totalNeed(state.ledger.entries.keys(), budgetNeed(state));
  const fraction = state.spent + remaining === 0 ? 1 : state.spent / (state.spent + remaining);
  state.progress = Math.max(state.progress, Math.min(fraction, 0.999));
  return state.progress;
}

export const isScanComplete = (state: ScanState, budgetPercent: number): boolean => state.finishedBudget !== null && clampBudget(budgetPercent) <= state.finishedBudget;

export async function runScan(state: ScanState, recognize: EntityRecognizer, handlers: ScanHandlers, budgetPercent: () => number): Promise<void> {
  const { ledger } = state;
  if (state.finishedBudget !== null) Object.assign(state, { finishedBudget: null, progress: 0, spent: 0 });
  const roundSize = roundSizeFor(ledger.groups.length);
  while (!handlers.shouldStop()) {
    const main = selectRound(ledger, ledger.groupKeys, state.probed, mainNeed(state), roundSize);
    if (main.length) {
      await probeGroups(state, main, ledger.groupKeys, recognize, handlers);
      continue;
    }
    const allowance = Math.min(roundSize, budgetLimit(state, budgetPercent()));
    const extra = allowance > 0 ? selectRound(ledger, ledger.groupKeys, state.probed, budgetNeed(state), allowance) : [];
    if (extra.length) {
      state.budgetUsed += extra.length;
      await probeGroups(state, extra, ledger.groupKeys, recognize, handlers);
      continue;
    }
    if (!state.auditDone) {
      const audit = auditKeys(state);
      const sampled = selectRound(ledger, audit.keysOf, state.probed, audit.needOf, audit.limit);
      state.auditDone = true;
      if (sampled.length) await probeGroups(state, sampled, audit.keysOf, recognize, handlers);
      continue;
    }
    break;
  }
  if (!handlers.shouldStop()) {
    state.finishedBudget = clampBudget(budgetPercent());
    state.progress = 1;
    handlers.onAdvance(1);
  }
}
