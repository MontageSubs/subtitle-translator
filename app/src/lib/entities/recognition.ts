import { postTermTranslations } from "../../api/translation/termTranslations";
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
import { buildLedger, isDocumentCased, type SentenceEntry } from "./planning/ledger";
import { DEFAULT_BUDGET_PERCENT, clampBudget, createScanState, isScanComplete, runScan, snapshotScan, type ScanState } from "./planning/scan";
import { createWordPriors, NO_PRIORS } from "./knowledge/priors";
import { createTokenizer } from "./knowledge/tokens";
import { profileFor, RECOGNITION_VERSION } from "./profile";
import { buildRecognitionUnits, type RecognitionUnit } from "./units";
import { normalizeTermKey } from "./termKey";

type RecognitionStage = "loading" | "recognizing" | "translating";

export interface RecognitionProgress {
  stage: RecognitionStage;
  done: number;
  total: number;
  found?: number;
  accelerated?: boolean;
}

export interface DetectionInput {
  files: readonly SubtitleFile[];
  sourceLang: string;
  sdhEnabled: boolean;
  caseSensitive: boolean;
  model: ModelManifest;
}

export interface DetectionSession {
  readonly units: readonly RecognitionUnit[];
  readonly sentences: readonly SentenceEntry[];
  readonly fingerprint: string;
  readonly sourceLang: string;
  readonly lexicon: ModelManifest | null;
  readonly scan: ScanState;
  budgetPercent: number;
  found: number;
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

interface TranslatedTerm extends PendingTerm {
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

const CHECKPOINT_INTERVAL_MS = 2000;
const TERMS_PER_REQUEST = 300;
const TERM_RETRY_ROUNDS = 1;

export const nerModelFor = (sourceLang: string, targetLang: string): ModelManifest | undefined =>
  selectModel("ner", baseLanguage(sourceLang), ({ useWhen }) => usesModelForPair(useWhen, sourceLang, targetLang));

export function createDetectionSession(input: DetectionInput, restored: RecognitionCheckpoint | null, budgetPercent = DEFAULT_BUDGET_PERCENT): DetectionSession {
  const profile = profileFor(input.sourceLang);
  const units = buildRecognitionUnits(input.files.map(({ cues }) => applySdhStripping(cues, input.sourceLang, input.sdhEnabled).cues), input.sourceLang, profile);
  const lexicon = installedModel("lexicon", baseLanguage(input.sourceLang)) ?? null;
  const fingerprint = [input.model.id, input.model.version, lexicon ? `${lexicon.id}@${lexicon.version}` : "-", input.sourceLang, input.sdhEnabled ? 1 : 0, input.caseSensitive ? 1 : 0, RECOGNITION_VERSION, units.length, hashUnits(units)].join("|");
  const checkpoint = restored?.fingerprint === fingerprint ? restored : null;
  const tokenizer = createTokenizer(profile);
  const sentences = units.map((unit): SentenceEntry => ({ unit, tokens: tokenizer.tokenize(unit.text, unit.breaks) }));
  const collector = createCandidateCollector({ caseSensitive: input.caseSensitive, isPlausible: profile.isPlausibleName, restored: checkpoint?.collector });
  const ledger = buildLedger(sentences, profile, NO_PRIORS, isDocumentCased(units, profile));
  const scan = createScanState(profile, sentences, ledger, collector, checkpoint?.scan);
  return { units, sentences, fingerprint, sourceLang: input.sourceLang, lexicon, scan, budgetPercent: clampBudget(budgetPercent), found: checkpoint?.collector.emitted.length ?? 0 };
}

export const isDetectionComplete = (session: DetectionSession): boolean => isScanComplete(session.scan, session.budgetPercent);

export const detectionFraction = (session: DetectionSession): number => session.scan.progress;

export const snapshotSession = (session: DetectionSession, pending: string[], translations: Record<string, Record<string, string>>): RecognitionCheckpoint => ({
  schema: 1,
  fingerprint: session.fingerprint,
  scan: snapshotScan(session.scan),
  collector: session.scan.collector.snapshot(),
  pending,
  translations,
  savedAt: Date.now(),
});

async function loadPriors(session: DetectionSession, signal: AbortSignal): Promise<void> {
  if (!session.lexicon) return;
  try {
    await untilAborted(prepareModel(session.lexicon), signal);
    const language = lexiconFor(session.lexicon.id, baseLanguage(session.sourceLang));
    if (language) session.scan.ledger.usePriors(createWordPriors(language));
  } catch (error) {
    if (signal.aborted) throw error;
    session.scan.ledger.usePriors(NO_PRIORS);
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
  let lastCheckpoint = Date.now();
  await runScan(session.scan, recognize, {
    knownKeys: handlers.knownKeys,
    onTerms: (sources) => {
      session.found += sources.length;
      handlers.onTerms(sources);
    },
    onAdvance: (fraction) => {
      handlers.onProgress({ stage: "recognizing", done: Math.round(fraction * session.units.length), total: session.units.length, found: session.found, accelerated: activeBackend() === "webgpu" });
      if (Date.now() - lastCheckpoint >= CHECKPOINT_INTERVAL_MS) {
        handlers.onCheckpoint();
        lastCheckpoint = Date.now();
      }
    },
    shouldStop: () => signal.aborted,
  }, () => session.budgetPercent);
  if (signal.aborted) throw abortError();
  handlers.onCheckpoint();
}

export async function translateTerms(pending: readonly PendingTerm[], input: TranslationInput, signal: AbortSignal, handlers: TranslationHandlers): Promise<number> {
  let queue = [...pending];
  let settled = 0;
  for (let round = 0; round <= TERM_RETRY_ROUNDS && queue.length; round++) {
    const failed: PendingTerm[] = [];
    for (let offset = 0; offset < queue.length; offset += TERMS_PER_REQUEST) {
      if (signal.aborted) throw abortError();
      const batch = queue.slice(offset, offset + TERMS_PER_REQUEST);
      const response = await postTermTranslations({ terms: batch.map(({ source }, id) => ({ id, text: source })), source: input.sourceLang, target: input.targetLang, provider: input.provider }, signal);
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
