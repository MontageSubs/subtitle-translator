import { abortError, formatWorkerError } from "../../api/translation/errors";
import { t, type TranslationKey } from "../../i18n";
import { clearPendingRecognition, deferRecognitionUntilModelReady, pendingRecognitionModel } from "../../lib/entities/pendingRecognition";
import { nerModelFor, isTermsUnsupportedByService, recognizeTerms, type RecognitionProgress } from "../../lib/entities/recognition";
import { mergeRecognizedTerms } from "../../lib/entities/termMerge";
import { checkModelCompatibility } from "../../lib/models/compatibility";
import { isModelReady, refreshModels, subscribeModels } from "../../lib/models/manager";
import { NerError } from "../../lib/models/ner/client";
import { baseLanguage } from "../../lib/subtitle/common/languageCodes";
import { buildPath, navigate } from "../../router/router";
import { getLocale } from "../../i18n";
import { AUTO_DETECT_CODE } from "../../utils/languageProfiles";
import type { WorkspaceContext } from "./context";
import { fileProblem, hasUsableFiles } from "./fileValidation";
import type { SubtitleFile } from "./state";

export interface TermRecognitionHandle {
  refresh(): void;
}

interface RecognitionTarget {
  modelId: string;
  sourceLang: string;
  targetLang: string;
  files: SubtitleFile[];
}

const NER_FAILURE_KEYS: Record<string, TranslationKey> = {
  memory: "terms.recognize.error.memory",
  corrupt: "terms.recognize.error.model",
  load: "terms.recognize.error.model",
};

function dominantLanguage(files: readonly SubtitleFile[]): string | null {
  const counts = new Map<string, number>();
  for (const { detectedLang } of files) if (detectedLang) counts.set(baseLanguage(detectedLang), (counts.get(baseLanguage(detectedLang)) ?? 0) + 1);
  return [...counts].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
}

export function mountTermRecognition(ctx: WorkspaceContext): TermRecognitionHandle {
  const { state } = ctx;
  const container = ctx.query<HTMLElement>("#term-recognize");
  const button = ctx.query<HTMLButtonElement>("#term-recognize-button");
  const status = ctx.query<HTMLElement>("#term-recognize-status");
  let running: AbortController | null = null;
  let runSignature = "";

  function resolveTarget(): RecognitionTarget | null {
    const usable = state.files.filter((file) => fileProblem(file) === null);
    const chosen = ctx.language.sourceCode();
    const sourceLang = chosen && chosen !== AUTO_DETECT_CODE ? baseLanguage(chosen) : dominantLanguage(usable);
    const targetLang = ctx.language.targetCode();
    const model = sourceLang ? nerModelFor(sourceLang, targetLang) : undefined;
    if (!sourceLang || !model || !usable.length) return null;
    const files = chosen === AUTO_DETECT_CODE ? usable.filter((file) => file.detectedLang && baseLanguage(file.detectedLang) === sourceLang) : usable;
    return files.length ? { modelId: model.id, sourceLang, targetLang, files } : null;
  }

  const signatureOf = (target: RecognitionTarget | null): string => (target ? `${target.sourceLang}>${target.targetLang}:${target.files.map(({ id }) => id).join(",")}` : "");

  const setStatus = (message: string): void => {
    status.textContent = message;
  };

  function describeProgress({ stage, done, total }: RecognitionProgress): string {
    if (stage === "loading") return t("terms.recognize.status.loading");
    return t(stage === "recognizing" ? "terms.recognize.status.recognizing" : "terms.recognize.status.translating", { done, total });
  }

  function describeFailure(error: unknown): string {
    if (error instanceof NerError) return t(NER_FAILURE_KEYS[error.failure] ?? "terms.recognize.error.model");
    if (isTermsUnsupportedByService(error)) return t("terms.recognize.error.service");
    return formatWorkerError(error);
  }

  function interrupt(): void {
    running?.abort();
    running = null;
    runSignature = "";
    button.disabled = false;
  }

  async function execute(target: RecognitionTarget): Promise<void> {
    interrupt();
    const controller = new AbortController();
    running = controller;
    runSignature = signatureOf(target);
    button.disabled = true;
    try {
      const outcome = await recognizeTerms(
        { files: target.files, sourceLang: target.sourceLang, targetLang: target.targetLang, provider: state.provider, sdhEnabled: state.sdhEnabled, caseSensitive: state.caseSensitiveTerms, glossary: ctx.assist.glossary.getEntries() },
        controller.signal,
        (progress) => setStatus(describeProgress(progress)),
      );
      if (controller.signal.aborted) throw abortError();
      const merged = mergeRecognizedTerms(ctx.assist.glossary.getEntries(), outcome.terms, state.caseSensitiveTerms);
      if (merged.added) ctx.assist.glossary.setEntries(merged.entries);
      state.glossaryEntries = ctx.assist.glossary.getEntries();
      ctx.task.updateHeader();
      const message = !merged.added ? t("terms.recognize.status.none") : outcome.unresolved ? t("terms.recognize.status.partial", { count: merged.added, failed: outcome.unresolved }) : t("terms.recognize.status.done", { count: merged.added });
      setStatus(message);
      ctx.announce(message);
    } catch (error) {
      if (!controller.signal.aborted) setStatus(describeFailure(error));
    } finally {
      if (running === controller) {
        running = null;
        runSignature = "";
        button.disabled = false;
      }
    }
  }

  async function start(): Promise<void> {
    const target = resolveTarget();
    if (!target) return;
    await refreshModels();
    if (!isModelReady(target.modelId)) {
      deferRecognitionUntilModelReady(target.modelId);
      navigate(buildPath(getLocale(), "models"));
      return;
    }
    clearPendingRecognition();
    await execute(target);
  }

  async function refresh(): Promise<void> {
    const target = resolveTarget();
    const supported = target !== null && hasUsableFiles(state) && (await checkModelCompatibility()) === null;
    if (ctx.signal.aborted) return;
    container.hidden = !supported;
    if (running && runSignature !== signatureOf(supported ? target : null)) {
      interrupt();
      setStatus("");
    }
    if (supported && !running && pendingRecognitionModel() === target.modelId) {
      await refreshModels();
      if (isModelReady(target.modelId)) await start();
    }
  }

  button.addEventListener("click", () => void start(), { signal: ctx.signal });
  ctx.signal.addEventListener("abort", interrupt, { once: true });
  const unsubscribe = subscribeModels(() => void refresh());
  ctx.signal.addEventListener("abort", unsubscribe, { once: true });
  void refresh();

  return { refresh: () => void refresh() };
}
