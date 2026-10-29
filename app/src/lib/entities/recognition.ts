import { postTerms } from "../../api/translation/terms";
import { WorkerRequestError, abortError } from "../../api/translation/errors";
import type { SubtitleFile } from "../../pages/translator/state";
import { selectModel } from "../models/selection";
import type { ModelManifest } from "../models/types";
import { prepareModel, recognizeEntities } from "../models/runtime/hub";
import { baseLanguage } from "../subtitle/common/languageCodes";
import { createCandidateCollector, type CandidateCollector } from "./candidates";
import { hashUnits, type RecognitionCheckpoint } from "./checkpoint";
import { hasConsistencyRisk } from "./consistencyRisk";
import { createNameLocks, type NameLocks } from "./nameLocks";
import { entityRulesFor, RULES_VERSION } from "./rules/registry";
import { overlaps, type EntityLanguageRules } from "./rules/shared";
import { buildRecognitionUnits } from "./sourceText";
import { normalizeTermKey } from "./termKey";

export type RecognitionStage = "loading" | "recognizing" | "translating";

export interface RecognitionProgress {
  stage: RecognitionStage;
  done: number;
  total: number;
}

export interface DetectionInput {
  files: readonly SubtitleFile[];
  sourceLang: string;
  sdhEnabled: boolean;
  caseSensitive: boolean;
  model: ModelManifest;
}

export interface DetectionSession {
  readonly units: readonly string[];
  readonly fingerprint: string;
  readonly rules: EntityLanguageRules;
  readonly lexicon: ReadonlySet<string>;
  readonly locks: NameLocks;
  readonly collector: CandidateCollector;
  readonly dismissed: Map<string, number>;
  readonly seen: Set<string>;
  nextUnit: number;
}

export interface DetectionHandlers {
  knownKeys(): ReadonlySet<string>;
  onTerms(sources: string[]): void;
  onProgress(progress: RecognitionProgress): void;
  onCheckpoint(): void;
}

export interface PendingTerm {
  id: string;
  source: string;
}

export interface TranslatedTerm extends PendingTerm {
  target: string | null;
}

export interface TranslationInput {
  sourceLang: string;
  targetLang: string;
  provider: string;
  caseSensitive: boolean;
}

export interface TranslationHandlers {
  onTranslated(terms: TranslatedTerm[]): void;
  onProgress(progress: RecognitionProgress): void;
}

const UNITS_PER_GROUP = 48;
const DISMISS_AFTER_OCCURRENCES = 3;
const TERMS_PER_REQUEST = 300;
const TERM_RETRY_ROUNDS = 1;

export const nerModelFor = (sourceLang: string, targetLang: string): ModelManifest | undefined =>
  hasConsistencyRisk(sourceLang, targetLang) ? selectModel("ner", baseLanguage(sourceLang)) : undefined;

export function createDetectionSession(input: DetectionInput, restored: RecognitionCheckpoint | null): DetectionSession {
  const rules = entityRulesFor(input.sourceLang);
  const units = buildRecognitionUnits(input.files, input.sourceLang, input.sdhEnabled, rules);
  const fingerprint = [input.model.id, input.model.version, input.sourceLang, input.sdhEnabled ? 1 : 0, input.caseSensitive ? 1 : 0, RULES_VERSION, units.length, hashUnits(units)].join("|");
  const checkpoint = restored?.fingerprint === fingerprint ? restored : null;
  const nextUnit = Math.min(checkpoint?.nextUnit ?? 0, units.length);
  return {
    units,
    fingerprint,
    rules,
    lexicon: rules.buildLexicon(units),
    locks: createNameLocks(rules, input.caseSensitive, checkpoint?.locks),
    collector: createCandidateCollector({ caseSensitive: input.caseSensitive, isPlausible: rules.isPlausibleName, restored: checkpoint?.collector }),
    dismissed: new Map(checkpoint?.dismissed),
    seen: new Set(units.slice(0, nextUnit)),
    nextUnit,
  };
}

export const isDetectionComplete = (session: DetectionSession): boolean => session.nextUnit >= session.units.length;

export const snapshotSession = (session: DetectionSession, pending: string[], translations: Record<string, Record<string, string>>): RecognitionCheckpoint => ({
  schema: 1,
  fingerprint: session.fingerprint,
  nextUnit: session.nextUnit,
  locks: session.locks.list(),
  dismissed: [...session.dismissed],
  collector: session.collector.snapshot(),
  pending,
  translations,
  savedAt: Date.now(),
});

async function detectGroup(session: DetectionSession, group: readonly string[], signal: AbortSignal, handlers: DetectionHandlers): Promise<void> {
  const groupSeen = new Set<string>();
  const runnable: { unit: string; candidates: ReturnType<EntityLanguageRules["findCandidates"]> }[] = [];
  for (const unit of group) {
    if (session.seen.has(unit) || groupSeen.has(unit)) continue;
    groupSeen.add(unit);
    const candidates = session.rules.findCandidates(unit, session.locks.cover(unit), session.lexicon).filter(({ key }) => (session.dismissed.get(key) ?? 0) < DISMISS_AFTER_OCCURRENCES);
    if (candidates.length) runnable.push({ unit, candidates });
  }
  const results = runnable.length ? await recognizeEntities(runnable.map(({ unit }) => unit), signal) : [];
  runnable.forEach(({ candidates }, index) => {
    const entities = results[index];
    for (const candidate of candidates) if (!entities.some((entity) => overlaps(entity, candidate))) session.dismissed.set(candidate.key, (session.dismissed.get(candidate.key) ?? 0) + 1);
    const found = session.collector.add(entities, handlers.knownKeys());
    found.forEach(({ source }) => session.locks.add(source));
    if (found.length) handlers.onTerms(found.map(({ source }) => source));
  });
  groupSeen.forEach((unit) => session.seen.add(unit));
}

export async function detectTerms(session: DetectionSession, model: ModelManifest, signal: AbortSignal, handlers: DetectionHandlers): Promise<void> {
  handlers.onProgress({ stage: "loading", done: 0, total: 1 });
  await prepareModel(model);
  while (session.nextUnit < session.units.length) {
    if (signal.aborted) throw abortError();
    const end = Math.min(session.nextUnit + UNITS_PER_GROUP, session.units.length);
    await detectGroup(session, session.units.slice(session.nextUnit, end), signal, handlers);
    session.nextUnit = end;
    handlers.onProgress({ stage: "recognizing", done: end, total: session.units.length });
    handlers.onCheckpoint();
  }
}

export async function translateTerms(pending: readonly PendingTerm[], input: TranslationInput, signal: AbortSignal, handlers: TranslationHandlers): Promise<number> {
  let queue = [...pending];
  let settled = 0;
  for (let round = 0; round <= TERM_RETRY_ROUNDS && queue.length; round++) {
    const failed: PendingTerm[] = [];
    for (let offset = 0; offset < queue.length; offset += TERMS_PER_REQUEST) {
      if (signal.aborted) throw abortError();
      const batch = queue.slice(offset, offset + TERMS_PER_REQUEST);
      const response = await postTerms({ terms: batch.map(({ source }, id) => ({ id, text: source })), source: input.sourceLang, target: input.targetLang, provider: input.provider }, signal);
      handlers.onTranslated(response.results.map(({ id, translation }) => {
        const { source, id: termId } = batch[id];
        const target = translation.trim();
        return { id: termId, source, target: normalizeTermKey(source, input.caseSensitive) === normalizeTermKey(target, input.caseSensitive) ? null : target };
      }));
      settled += response.results.length;
      handlers.onProgress({ stage: "translating", done: settled, total: pending.length });
      const failedIds = new Set(response.failed);
      failed.push(...batch.filter((_, id) => failedIds.has(id)));
    }
    queue = failed;
  }
  return queue.length;
}

export const isTermsUnsupportedByService = (error: unknown): boolean => error instanceof WorkerRequestError && error.code === "not found";
