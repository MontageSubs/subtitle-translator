import { postTerms } from "../../api/translation/terms";
import { WorkerRequestError, abortError } from "../../api/translation/errors";
import type { SubtitleFile } from "../../pages/translator/state";
import { modelsOfKind } from "../models/catalog";
import type { ModelManifest } from "../models/types";
import { ensureNerRuntime, recognizeEntities } from "../models/ner/client";
import { baseLanguage } from "../subtitle/common/languageCodes";
import { createCandidateCollector, type CandidateCollector } from "./candidates";
import { hasConsistencyRisk } from "./consistencyRisk";
import { buildRecognitionChunks } from "./sourceText";
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
}

export interface DetectionSession {
  readonly chunks: readonly string[];
  readonly collector: CandidateCollector;
  completedChunks: number;
}

export interface DetectionHandlers {
  knownKeys(): ReadonlySet<string>;
  onTerms(sources: string[]): void;
  onProgress(progress: RecognitionProgress): void;
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

const TERMS_PER_REQUEST = 300;
const TERM_RETRY_ROUNDS = 1;

export const nerModelFor = (sourceLang: string, targetLang: string): ModelManifest | undefined =>
  hasConsistencyRisk(sourceLang, targetLang) ? modelsOfKind("ner").find((model) => model.languages.includes(baseLanguage(sourceLang))) : undefined;

export const createDetectionSession = ({ files, sourceLang, sdhEnabled, caseSensitive }: DetectionInput): DetectionSession => ({
  chunks: buildRecognitionChunks(files, sourceLang, sdhEnabled),
  collector: createCandidateCollector({ sourceLang, caseSensitive }),
  completedChunks: 0,
});

export const isDetectionComplete = (session: DetectionSession): boolean => session.completedChunks >= session.chunks.length;

export async function detectTerms(session: DetectionSession, model: ModelManifest, signal: AbortSignal, handlers: DetectionHandlers): Promise<void> {
  handlers.onProgress({ stage: "loading", done: 0, total: 1 });
  await ensureNerRuntime(model);
  if (signal.aborted) throw abortError();
  handlers.onProgress({ stage: "recognizing", done: session.completedChunks, total: session.chunks.length });
  await recognizeEntities(session.chunks.slice(session.completedChunks), signal, (batch) => {
    session.completedChunks += batch.length;
    const found = session.collector.add(batch.flat(), handlers.knownKeys());
    if (found.length) handlers.onTerms(found.map(({ source }) => source));
    handlers.onProgress({ stage: "recognizing", done: session.completedChunks, total: session.chunks.length });
  });
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
