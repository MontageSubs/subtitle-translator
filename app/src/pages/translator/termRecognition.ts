import { formatWorkerError } from "../../api/translation/errors";
import { getLocale, t, type TranslationKey } from "../../i18n";
import { clearPendingRecognition, deferRecognitionUntilModelReady, pendingRecognitionModel } from "../../lib/entities/pendingRecognition";
import { createDetectionSession, detectTerms, isDetectionComplete, isTermsUnsupportedByService, nerModelFor, translateTerms, type DetectionSession, type RecognitionProgress } from "../../lib/entities/recognition";
import { knownTermKeys } from "../../lib/entities/termKey";
import { checkModelCompatibility } from "../../lib/models/compatibility";
import { isModelReady, refreshModels, subscribeModels } from "../../lib/models/manager";
import { NerError } from "../../lib/models/ner/client";
import type { ModelManifest } from "../../lib/models/types";
import { baseLanguage } from "../../lib/subtitle/common/languageCodes";
import { buildPath, navigate } from "../../router/router";
import { escapeHtml } from "../../utils/escapeHtml";
import { AUTO_DETECT_CODE } from "../../utils/languageProfiles";
import { tipAttr } from "../../utils/labelAttrs";
import type { WorkspaceContext } from "./context";
import { fileProblem, hasUsableFiles } from "./fileValidation";
import type { SubtitleFile } from "./state";

export interface TermRecognitionHandle {
  refresh(): void;
}

type RecognitionAction = "detect" | "pause" | "continue" | "send";

interface RecognitionTarget {
  model: ModelManifest;
  sourceLang: string;
  targetLang: string;
  files: SubtitleFile[];
}

interface RecognitionView {
  supported: boolean;
  action: RecognitionAction;
  label: string;
  tip: string;
  status: string;
  percent: number | null;
}

const PERCENT_SCALE = 100;

const ACTION_LABEL_KEYS: Record<RecognitionAction, TranslationKey> = {
  detect: "terms.recognize.action.detect",
  pause: "terms.recognize.action.pause",
  continue: "terms.recognize.action.continue",
  send: "terms.recognize.action.send",
};

const ACTION_TIP_KEYS: Record<RecognitionAction, TranslationKey> = {
  detect: "tip.recognizeTerms",
  pause: "tip.recognizePause",
  continue: "tip.recognizeContinue",
  send: "tip.recognizeSend",
};

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
  const glossary = ctx.assist.glossary;
  const host = ctx.query<HTMLElement>("#glossary-editor");
  let session: DetectionSession | null = null;
  let sessionSignature = "";
  let running: AbortController | null = null;
  let supported = false;
  let status = "";
  let percent: number | null = null;
  let translatedCount = 0;

  function resolveTarget(): RecognitionTarget | null {
    const usable = state.files.filter((file) => fileProblem(file) === null);
    const chosen = ctx.language.sourceCode();
    const sourceLang = chosen && chosen !== AUTO_DETECT_CODE ? baseLanguage(chosen) : dominantLanguage(usable);
    const targetLang = ctx.language.targetCode();
    const model = sourceLang ? nerModelFor(sourceLang, targetLang) : undefined;
    if (!sourceLang || !model || !usable.length) return null;
    const files = chosen === AUTO_DETECT_CODE ? usable.filter((file) => file.detectedLang && baseLanguage(file.detectedLang) === sourceLang) : usable;
    return files.length ? { model, sourceLang, targetLang, files } : null;
  }

  const signatureOf = (target: RecognitionTarget | null): string => (target ? `${target.sourceLang}>${target.targetLang}:${target.files.map(({ id }) => id).join(",")}` : "");

  function nextAction(): RecognitionAction {
    if (running) return "pause";
    if (session && !isDetectionComplete(session)) return "continue";
    return glossary.pendingTerms().length ? "send" : "detect";
  }

  function view(): RecognitionView {
    const action = nextAction();
    const label = t(ACTION_LABEL_KEYS[action], { count: glossary.pendingTerms().length });
    return { supported, action, label, tip: t(ACTION_TIP_KEYS[action]), status, percent };
  }

  function paint(): void {
    const current = view();
    const button = host.querySelector<HTMLButtonElement>("#term-recognize-button");
    const region = host.querySelector<HTMLElement>("#term-recognize-status");
    const bar = host.querySelector<HTMLElement>("#term-recognize-bar");
    const fill = host.querySelector<HTMLElement>("#term-recognize-fill");
    const text = host.querySelector<HTMLElement>("#term-recognize-text");
    if (!button || !region || !bar || !fill || !text) return;
    button.hidden = !current.supported;
    button.textContent = current.label;
    button.title = current.tip;
    button.dataset.recognize = current.action;
    region.hidden = !current.supported || !current.status;
    text.textContent = current.status;
    bar.hidden = current.percent === null;
    fill.style.width = `${current.percent ?? 0}%`;
  }

  glossary.attachFooterSlot({
    actionMarkup() {
      const current = view();
      return `<button type="button" class="action-pill action-pill--accent" id="term-recognize-button" data-recognize="${current.action}" ${tipAttr(current.tip)}${current.supported ? "" : " hidden"}>${escapeHtml(current.label)}</button>`;
    },
    statusMarkup() {
      const current = view();
      return `<div class="glossary__recognition" id="term-recognize-status" role="status" aria-live="polite"${current.supported && current.status ? "" : " hidden"}>
        <span class="field__desc" id="term-recognize-text">${escapeHtml(current.status)}</span>
        <div class="glossary__progress" id="term-recognize-bar" aria-hidden="true"${current.percent === null ? " hidden" : ""}><div class="glossary__progress-fill" id="term-recognize-fill" style="width:${current.percent ?? 0}%"></div></div>
      </div>`;
    },
    mounted: paint,
  });

  function describeProgress({ stage, done, total }: RecognitionProgress): string {
    if (stage === "loading") return t("terms.recognize.status.loading");
    return t(stage === "recognizing" ? "terms.recognize.status.recognizing" : "terms.recognize.status.translating", { done, total });
  }

  function describeFailure(error: unknown): string {
    if (error instanceof NerError) return t(NER_FAILURE_KEYS[error.failure] ?? "terms.recognize.error.model");
    if (isTermsUnsupportedByService(error)) return t("terms.recognize.error.service");
    return formatWorkerError(error);
  }

  function describeWaiting(): string {
    const waiting = glossary.pendingTerms().length;
    return waiting ? t("terms.recognize.status.pending", { count: waiting }) : "";
  }

  function report(progress: RecognitionProgress): void {
    status = describeProgress(progress);
    percent = progress.stage === "loading" || !progress.total ? null : Math.floor((progress.done / progress.total) * PERCENT_SCALE);
    paint();
  }

  function settle(message: string): void {
    status = message;
    percent = null;
    paint();
  }

  function pause(): void {
    if (!running) return;
    running.abort();
    running = null;
    const waiting = describeWaiting();
    settle(session && !isDetectionComplete(session) ? t("terms.recognize.status.paused", { done: session.completedChunks, total: session.chunks.length }) : waiting);
  }

  function discardSession(): void {
    session = null;
    sessionSignature = "";
    settle("");
  }

  async function detect(target: RecognitionTarget, active: DetectionSession, signal: AbortSignal): Promise<void> {
    await detectTerms(active, target.model, signal, {
      knownKeys: () => knownTermKeys(glossary.getDraftEntries(), state.caseSensitiveTerms),
      onTerms: (sources) => glossary.appendPending(sources),
      onProgress: report,
    });
  }

  async function translatePending(target: RecognitionTarget, signal: AbortSignal): Promise<void> {
    const pending = glossary.pendingTerms();
    if (!pending.length) return;
    report({ stage: "translating", done: 0, total: pending.length });
    await translateTerms(pending, { sourceLang: target.sourceLang, targetLang: target.targetLang, provider: state.provider, caseSensitive: state.caseSensitiveTerms }, signal, {
      onTranslated: (terms) => {
        glossary.resolvePending(terms);
        translatedCount += terms.filter(({ target: translation }) => translation !== null).length;
      },
      onProgress: report,
    });
  }

  function conclude(): void {
    const waiting = glossary.pendingTerms().length;
    const message = waiting
      ? t("terms.recognize.status.partial", { count: translatedCount, failed: waiting })
      : translatedCount
        ? t("terms.recognize.status.done", { count: translatedCount })
        : t("terms.recognize.status.none");
    settle(message);
    ctx.announce(message);
  }

  async function run(target: RecognitionTarget, action: RecognitionAction): Promise<void> {
    const controller = new AbortController();
    running = controller;
    paint();
    try {
      if (action !== "send" && session) await detect(target, session, controller.signal);
      await translatePending(target, controller.signal);
      conclude();
    } catch (error) {
      if (!controller.signal.aborted) settle(`${describeFailure(error)} ${describeWaiting()}`.trim());
    } finally {
      if (running === controller) running = null;
      paint();
    }
  }

  async function activate(): Promise<void> {
    const action = nextAction();
    if (action === "pause") return pause();
    const target = resolveTarget();
    if (!target) return;
    if (action !== "send") {
      await refreshModels();
      if (!isModelReady(target.model.id)) {
        deferRecognitionUntilModelReady(target.model.id);
        navigate(buildPath(getLocale(), "models"));
        return;
      }
      clearPendingRecognition();
    }
    if (action === "detect") {
      session = createDetectionSession({ files: target.files, sourceLang: target.sourceLang, sdhEnabled: state.sdhEnabled, caseSensitive: state.caseSensitiveTerms });
      translatedCount = 0;
    }
    sessionSignature = signatureOf(target);
    await run(target, action);
  }

  async function refresh(): Promise<void> {
    const target = resolveTarget();
    const available = target !== null && hasUsableFiles(state) && (await checkModelCompatibility()) === null;
    if (ctx.signal.aborted) return;
    supported = available;
    const signature = available ? signatureOf(target) : "";
    if (running && sessionSignature !== signature) pause();
    if (session && sessionSignature !== signature) discardSession();
    paint();
    if (available && !running && pendingRecognitionModel() === target.model.id) {
      await refreshModels();
      if (isModelReady(target.model.id)) await activate();
    }
  }

  host.addEventListener("click", (event) => {
    if ((event.target as HTMLElement).closest("#term-recognize-button")) void activate();
  }, { signal: ctx.signal });
  ctx.signal.addEventListener("abort", () => running?.abort(), { once: true });
  const unsubscribe = subscribeModels(() => void refresh());
  ctx.signal.addEventListener("abort", unsubscribe, { once: true });
  void refresh();

  return { refresh: () => void refresh() };
}
