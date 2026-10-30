import type { NerEntity } from "../../models/ner/decode";
import type { CandidateCollector } from "../candidates";
import type { RecognitionUnit } from "../units";
import type { RecognitionProfile } from "../profile";
import { gateSentence, isAllCapsSentence, type GateContext } from "./gate";
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

export interface SentenceEntry {
  unit: RecognitionUnit;
  tokens: readonly Token[];
}

export interface GroupHandlers {
  knownKeys(): ReadonlySet<string>;
  onTerms(sources: string[]): void;
}

export interface GroupOutcome {
  sent: number;
  skipped: number;
}

export type EntityRecognizer = (texts: readonly string[]) => Promise<NerEntity[][]>;

const MIN_DOCUMENT_CASE_UNITS = 20;
const MIN_CAPITALIZED_SHARE = 0.5;
const MIN_WORD_LENGTH = 2;
const SOLO_SCORE = 1;
const SOLO_TYPE = "PER";

export function collectScriptWords(entries: readonly (readonly Token[])[], profile: RecognitionProfile): Set<string> {
  const words = new Set<string>();
  if (!profile.cased) return words;
  for (const tokens of entries) for (const token of tokens) if (!token.numeric && token.text.length >= MIN_WORD_LENGTH && token.text === token.text.toLowerCase()) words.add(token.key);
  return words;
}

export function isDocumentCased(units: readonly RecognitionUnit[], profile: RecognitionProfile): boolean {
  if (!profile.cased) return false;
  let lettered = 0;
  let capitalized = 0;
  for (const { text } of units) {
    const first = text.match(/\p{L}/u)?.[0];
    if (first === undefined) continue;
    lettered += 1;
    if (first !== first.toLowerCase()) capitalized += 1;
  }
  return lettered >= MIN_DOCUMENT_CASE_UNITS && capitalized / lettered >= MIN_CAPITALIZED_SHARE;
}

function gateContext(state: DetectorState): GateContext {
  return { table: state.table, priors: state.priors, profile: state.profile, scriptWords: state.scriptWords, documentCased: state.documentCased };
}

function absorb(state: DetectorState, entry: SentenceEntry, entities: readonly NerEntity[], handlers: GroupHandlers): void {
  const informative = !isAllCapsSentence(entry.unit.text) && state.profile.cased && /\p{Ll}/u.test(entry.unit.text);
  const { fresh, verdicts } = state.collector.add(entities, handlers.knownKeys(), informative);
  state.table.observe(entry.unit.text, entry.tokens, entities, verdicts);
  if (fresh.length) handlers.onTerms(fresh.map(({ source }) => source));
}

export async function processGroup(state: DetectorState, group: readonly SentenceEntry[], recognize: EntityRecognizer, handlers: GroupHandlers): Promise<GroupOutcome> {
  const context = gateContext(state);
  const queued = new Set<string>();
  const runnable: SentenceEntry[] = [];
  let skipped = 0;
  for (const entry of group) {
    const { text } = entry.unit;
    if (state.seen.has(text) || queued.has(text)) {
      skipped += 1;
      continue;
    }
    const decision = gateSentence(text, entry.tokens, context);
    if (decision.kind === "skip") {
      skipped += 1;
      state.seen.add(text);
    } else if (decision.kind === "solo") {
      const { token } = decision;
      absorb(state, entry, [{ text: token.text, type: SOLO_TYPE, score: SOLO_SCORE, start: token.start, end: token.end }], handlers);
      skipped += 1;
      state.seen.add(text);
    } else {
      queued.add(text);
      runnable.push(entry);
    }
  }
  if (runnable.length) {
    const results = await recognize(runnable.map(({ unit }) => unit.text));
    runnable.forEach((entry, index) => absorb(state, entry, results[index], handlers));
    runnable.forEach(({ unit }) => state.seen.add(unit.text));
  }
  return { sent: runnable.length, skipped };
}
