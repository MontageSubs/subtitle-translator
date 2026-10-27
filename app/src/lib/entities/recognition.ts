import { postTerms } from "../../api/translation/terms";
import { WorkerRequestError, abortError } from "../../api/translation/errors";
import type { SubtitleFile } from "../../pages/translator/state";
import type { DictionaryEntry } from "../../utils/dictionary";
import { modelsOfKind } from "../models/catalog";
import type { ModelManifest } from "../models/types";
import { ensureNerRuntime, recognizeEntities } from "../models/ner/client";
import { baseLanguage } from "../subtitle/common/languageCodes";
import { collectCandidates } from "./candidates";
import { hasConsistencyRisk } from "./consistencyRisk";
import { buildRecognitionChunks } from "./sourceText";
import { knownTermKeys, normalizeTermKey } from "./termKey";

export type RecognitionStage = "loading" | "recognizing" | "translating";

export interface RecognitionProgress {
  stage: RecognitionStage;
  done: number;
  total: number;
}

export interface RecognitionInput {
  files: readonly SubtitleFile[];
  sourceLang: string;
  targetLang: string;
  provider: string;
  sdhEnabled: boolean;
  caseSensitive: boolean;
  glossary: DictionaryEntry[];
}

export interface RecognitionOutcome {
  terms: DictionaryEntry[];
  candidates: number;
  unresolved: number;
}

const TERMS_PER_REQUEST = 300;
const TERM_RETRY_ROUNDS = 1;

export const nerModelFor = (sourceLang: string, targetLang: string): ModelManifest | undefined =>
  hasConsistencyRisk(sourceLang, targetLang) ? modelsOfKind("ner").find((model) => model.languages.includes(baseLanguage(sourceLang))) : undefined;

const unchangedByTranslation = (source: string, target: string, caseSensitive: boolean): boolean => normalizeTermKey(source, caseSensitive) === normalizeTermKey(target, caseSensitive);

async function translateCandidates(
  sources: readonly string[],
  input: RecognitionInput,
  signal: AbortSignal,
  onProgress: (progress: RecognitionProgress) => void,
): Promise<{ translations: Map<number, string>; unresolved: number }> {
  const translations = new Map<number, string>();
  let pending = sources.map((text, id) => ({ id, text }));
  for (let round = 0; round <= TERM_RETRY_ROUNDS && pending.length; round++) {
    const failed: typeof pending = [];
    for (let offset = 0; offset < pending.length; offset += TERMS_PER_REQUEST) {
      if (signal.aborted) throw abortError();
      const batch = pending.slice(offset, offset + TERMS_PER_REQUEST);
      const response = await postTerms({ terms: batch, source: input.sourceLang, target: input.targetLang, provider: input.provider }, signal);
      response.results.forEach(({ id, translation }) => translations.set(id, translation.trim()));
      const failedIds = new Set(response.failed);
      failed.push(...batch.filter(({ id }) => failedIds.has(id)));
      onProgress({ stage: "translating", done: translations.size, total: sources.length });
    }
    pending = failed;
  }
  return { translations, unresolved: pending.length };
}

export async function recognizeTerms(input: RecognitionInput, signal: AbortSignal, onProgress: (progress: RecognitionProgress) => void): Promise<RecognitionOutcome> {
  const model = nerModelFor(input.sourceLang, input.targetLang);
  if (!model) return { terms: [], candidates: 0, unresolved: 0 };
  onProgress({ stage: "loading", done: 0, total: 1 });
  await ensureNerRuntime(model);
  if (signal.aborted) throw abortError();

  const chunks = buildRecognitionChunks(input.files, input.sourceLang, input.sdhEnabled);
  onProgress({ stage: "recognizing", done: 0, total: chunks.length });
  const entities = await recognizeEntities(chunks, signal, (done, total) => onProgress({ stage: "recognizing", done, total }));
  const candidates = collectCandidates(entities, { sourceLang: input.sourceLang, caseSensitive: input.caseSensitive, knownKeys: knownTermKeys(input.glossary, input.caseSensitive) });
  if (!candidates.length) return { terms: [], candidates: 0, unresolved: 0 };

  onProgress({ stage: "translating", done: 0, total: candidates.length });
  const { translations, unresolved } = await translateCandidates(candidates.map(({ source }) => source), input, signal, onProgress);
  const terms = candidates.flatMap(({ source }, id) => {
    const target = translations.get(id);
    return target && !unchangedByTranslation(source, target, input.caseSensitive) ? [{ source, target }] : [];
  });
  return { terms, candidates: candidates.length, unresolved };
}

export const isTermsUnsupportedByService = (error: unknown): boolean => error instanceof WorkerRequestError && error.code === "not found";
