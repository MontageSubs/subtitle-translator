import type { NerEntity } from "../../models/ner/decode";
import type { CandidateCollector } from "../candidates";
import type { RecognitionProfile } from "../profile";
import { isCaseInformative, type SentenceEntry } from "../planning/ledger";
import type { EntityRecognizer, ScanHandlers } from "../planning/scan";
import { gateSentence, type GateContext } from "./gate";
import type { WordPriors } from "./priors";
import type { KnowledgeTable } from "./table";
import type { Token } from "./tokens";

export interface DetectorState {
  readonly profile: RecognitionProfile;
  readonly table: KnowledgeTable;
  readonly collector: CandidateCollector;
  readonly scriptWords: ReadonlySet<string>;
  readonly documentCased: boolean;
  readonly seen: Set<string>;
  priors: WordPriors;
}

type DetectionHandlers = Pick<ScanHandlers, "knownKeys" | "onTerms">;

export interface ScanOutcome {
  consumed: number;
}

interface NamePlan {
  entry: SentenceEntry;
  spans: readonly (readonly Token[])[];
}

interface ScanPlan {
  consumed: number;
  runs: SentenceEntry[];
  names: NamePlan[];
  quiet: SentenceEntry[];
  deferred: SentenceEntry[];
}

export const RUN_BATCH_TARGET = 8;
export const MAX_SCAN_UNITS = 96;

const MIN_WORD_LENGTH = 2;
const NAME_SCORE = 1;
const NAME_TYPE = "PER";

export function collectScriptWords(entries: readonly (readonly Token[])[], profile: RecognitionProfile): Set<string> {
  const words = new Set<string>();
  if (!profile.cased) return words;
  for (const tokens of entries) for (const token of tokens) if (!token.numeric && token.text.length >= MIN_WORD_LENGTH && token.text === token.text.toLowerCase()) words.add(token.key);
  return words;
}

function gateContext(state: DetectorState): GateContext {
  return { table: state.table, priors: state.priors, profile: state.profile, scriptWords: state.scriptWords, documentCased: state.documentCased };
}

function absorb(state: DetectorState, entry: SentenceEntry, entities: readonly NerEntity[], known: ReadonlySet<string>, handlers: DetectionHandlers): void {
  const informative = isCaseInformative(entry.unit.text, state.profile);
  const { fresh, verdicts, strong } = state.collector.add(entities, known, informative);
  state.table.observe({ text: entry.unit.text, tokens: entry.tokens, entities, verdicts, strong, informative });
  if (fresh.length) handlers.onTerms(fresh.map(({ source }) => source));
}

function absorbNames({ entry, spans }: NamePlan, state: DetectorState, known: ReadonlySet<string>, handlers: DetectionHandlers): void {
  const entities = spans.map((run): NerEntity => {
    const start = run[0].start;
    const end = run[run.length - 1].stemEnd;
    return { text: entry.unit.text.slice(start, end), type: NAME_TYPE, score: NAME_SCORE, start, end };
  });
  absorb(state, entry, entities, known, handlers);
}

function planScan(entries: readonly SentenceEntry[], state: DetectorState, context: GateContext, runLimit: number): ScanPlan {
  const plan: ScanPlan = { consumed: 0, runs: [], names: [], quiet: [], deferred: [] };
  const queued = new Set<string>();
  const explained = new Set<string>();
  for (const entry of entries) {
    if (plan.runs.length >= runLimit) break;
    plan.consumed += 1;
    const { text } = entry.unit;
    if (state.seen.has(text) || queued.has(text)) {
      plan.quiet.push(entry);
      continue;
    }
    const decision = gateSentence(text, entry.tokens, context);
    if (decision.kind === "skip") plan.quiet.push(entry);
    else if (decision.kind === "names") plan.names.push({ entry, spans: decision.spans });
    else if (runLimit !== Infinity && decision.reasons.every((reason) => explained.has(reason))) plan.deferred.push(entry);
    else {
      queued.add(text);
      decision.reasons.forEach((reason) => explained.add(reason));
      plan.runs.push(entry);
    }
  }
  return plan;
}

async function executePlan(plan: ScanPlan, state: DetectorState, recognize: EntityRecognizer, known: ReadonlySet<string>, handlers: DetectionHandlers): Promise<void> {
  const results = plan.runs.length ? await recognize(plan.runs.map(({ unit }) => unit.text)) : [];
  plan.names.forEach((named) => absorbNames(named, state, known, handlers));
  plan.runs.forEach((entry, index) => absorb(state, entry, results[index], known, handlers));
  for (const { unit } of plan.quiet) state.seen.add(unit.text);
  for (const { entry } of plan.names) state.seen.add(entry.unit.text);
  for (const { unit } of plan.runs) state.seen.add(unit.text);
}

export async function processScan(state: DetectorState, entries: readonly SentenceEntry[], recognize: EntityRecognizer, handlers: DetectionHandlers): Promise<ScanOutcome> {
  const known = handlers.knownKeys();
  const context = gateContext(state);
  const first = planScan(entries, state, context, RUN_BATCH_TARGET);
  await executePlan(first, state, recognize, known, handlers);
  if (first.deferred.length) {
    await executePlan(planScan(first.deferred, state, context, Infinity), state, recognize, known, handlers);
  }
  return { consumed: first.consumed };
}
