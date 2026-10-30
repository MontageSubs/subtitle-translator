import { postTerms } from "../../api/translation/terms";
import { WorkerRequestError, abortError } from "../../api/translation/errors";
import type { SubtitleFile } from "../../pages/translator/state";
import { installedModel, selectModel } from "../models/selection";
import type { ModelManifest } from "../models/types";
import type { NerEntity } from "../models/ner/decode";
import { lexiconFor } from "../models/lexicon/driver";
import { untilAborted } from "../models/runtime/abortable";
import { ModelError, activeBackend, prepareModel, recognizeEntities } from "../models/runtime/modelRuntime";
import { baseLanguage } from "../subtitle/common/languageCodes";
import { applySdhStripping } from "../subtitle/extraction/sdh";
import { createCandidateCollector } from "./candidates";
import { hashUnits, type RecognitionCheckpoint } from "./checkpoint";
import { usesModelForPair } from "./nameScripts";
import { processGroup, collectScriptWords, isDocumentCased, type DetectorState, type SentenceEntry } from "./knowledge/detector";
import { createWordPriors, NO_PRIORS } from "./knowledge/priors";
import { createKnowledgeTable } from "./knowledge/table";
import { createTokenizer } from "./knowledge/tokens";
import { profileFor, RECOGNITION_VERSION } from "./profile";
import { buildRecognitionUnits, type RecognitionUnit } from "./units";
import { normalizeTermKey } from "./termKey";

export type RecognitionStage = "loading" | "recognizing" | "translating";

export interface RecognitionProgress {
  stage: RecognitionStage;
  done: number;
  total: number;
  skipped?: number;
  accelerated?: boolean;
}

export interface DetectionInput {
  files: readonly SubtitleFile[];
  sourceLang: string;
  sdhEnabled: boolean;
  caseSensitive: boolean;
  model: ModelManifest;
}

export interface CommittedKnowledge {
  knowledge: RecognitionCheckpoint["knowledge"];
  collector: RecognitionCheckpoint["collector"];
}

export interface DetectionSession {
  readonly units: readonly RecognitionUnit[];
  readonly sentences: readonly SentenceEntry[];
  readonly fingerprint: string;
  readonly sourceLang: string;
  readonly lexicon: ModelManifest | null;
  readonly state: DetectorState;
  committed: CommittedKnowledge;
  sent: number;
  skipped: number;
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

const UNITS_PER_GROUP = 24;
const TERMS_PER_REQUEST = 300;
const TERM_RETRY_ROUNDS = 1;

export const nerModelFor = (sourceLang: string, targetLang: string): ModelManifest | undefined =>
  selectModel("ner", baseLanguage(sourceLang), ({ useWhen }) => usesModelForPair(useWhen, sourceLang, targetLang));

export function createDetectionSession(input: DetectionInput, restored: RecognitionCheckpoint | null): DetectionSession {
  const profile = profileFor(input.sourceLang);
  const units = buildRecognitionUnits(input.files.map(({ cues }) => applySdhStripping(cues, input.sourceLang, input.sdhEnabled).cues), input.sourceLang, profile);
  const lexicon = installedModel("lexicon", baseLanguage(input.sourceLang)) ?? null;
  const fingerprint = [input.model.id, input.model.version, lexicon ? `${lexicon.id}@${lexicon.version}` : "-", input.sourceLang, input.sdhEnabled ? 1 : 0, input.caseSensitive ? 1 : 0, RECOGNITION_VERSION, units.length, hashUnits(units)].join("|");
  const checkpoint = restored?.fingerprint === fingerprint ? restored : null;
  const nextUnit = Math.min(checkpoint?.nextUnit ?? 0, units.length);
  const tokenizer = createTokenizer(profile);
  const sentences = units.map((unit): SentenceEntry => ({ unit, tokens: tokenizer.tokenize(unit.text, unit.breaks) }));
  const state: DetectorState = {
    profile,
    table: createKnowledgeTable(checkpoint?.knowledge),
    collector: createCandidateCollector({ caseSensitive: input.caseSensitive, isPlausible: profile.isPlausibleName, restored: checkpoint?.collector }),
    scriptWords: collectScriptWords(sentences.map(({ tokens }) => tokens), profile),
    documentCased: isDocumentCased(units, profile),
    seen: new Set(units.slice(0, nextUnit).map(({ text }) => text)),
    priors: NO_PRIORS,
  };
  const committed: CommittedKnowledge = { knowledge: state.table.snapshot(), collector: state.collector.snapshot() };
  return { units, sentences, fingerprint, sourceLang: input.sourceLang, lexicon, state, committed, sent: checkpoint?.sent ?? 0, skipped: checkpoint?.skipped ?? 0, nextUnit };
}

export const isDetectionComplete = (session: DetectionSession): boolean => session.nextUnit >= session.units.length;

export const snapshotSession = (session: DetectionSession, pending: string[], translations: Record<string, Record<string, string>>): RecognitionCheckpoint => ({
  schema: 2,
  fingerprint: session.fingerprint,
  nextUnit: session.nextUnit,
  sent: session.sent,
  skipped: session.skipped,
  knowledge: session.committed.knowledge,
  collector: session.committed.collector,
  pending,
  translations,
  savedAt: Date.now(),
});

async function loadPriors(session: DetectionSession, signal: AbortSignal): Promise<void> {
  if (!session.lexicon) return;
  try {
    await untilAborted(prepareModel(session.lexicon), signal);
    const language = lexiconFor(session.lexicon.id, baseLanguage(session.sourceLang));
    if (language) session.state.priors = createWordPriors(language);
  } catch (error) {
    if (signal.aborted) throw error;
    session.state.priors = NO_PRIORS;
  }
}

const isReloadable = (error: unknown): boolean => error instanceof ModelError && error.code === "load";

function recognizerFor(model: ModelManifest, signal: AbortSignal): (texts: readonly string[]) => Promise<NerEntity[][]> {
  const attempt = async (texts: readonly string[]): Promise<NerEntity[][]> => {
    await untilAborted(prepareModel(model), signal);
    return recognizeEntities(texts, signal);
  };
  return async (texts) => {
    try {
      return await attempt(texts);
    } catch (error) {
      if (signal.aborted || !isReloadable(error)) throw error;
      return attempt(texts);
    }
  };
}

export async function detectTerms(session: DetectionSession, model: ModelManifest, signal: AbortSignal, handlers: DetectionHandlers): Promise<void> {
  handlers.onProgress({ stage: "loading", done: 0, total: 1 });
  await untilAborted(prepareModel(model), signal);
  await loadPriors(session, signal);
  const recognize = recognizerFor(model, signal);
  while (session.nextUnit < session.units.length) {
    if (signal.aborted) throw abortError();
    const end = Math.min(session.nextUnit + UNITS_PER_GROUP, session.units.length);
    const outcome = await processGroup(session.state, session.sentences.slice(session.nextUnit, end), recognize, handlers);
    session.sent += outcome.sent;
    session.skipped += outcome.skipped;
    session.nextUnit = end;
    session.committed = { knowledge: session.state.table.snapshot(), collector: session.state.collector.snapshot() };
    handlers.onProgress({ stage: "recognizing", done: end, total: session.units.length, skipped: session.skipped, accelerated: activeBackend() === "webgpu" });
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
