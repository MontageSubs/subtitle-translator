import { formatWorkerError } from "../../api/translation/errors";
import { getLocale, t, type TranslationKey } from "../../i18n";
import { clearCheckpoint, loadCheckpoint, saveCheckpoint } from "../../lib/entities/checkpoint";
import { clearPendingRecognition, deferRecognitionUntilModelReady, pendingRecognitionModel } from "../../lib/entities/pendingRecognition";
import { createDetectionSession, detectTerms, isDetectionComplete, isTermsUnsupportedByService, nerModelFor, snapshotSession, translateTerms, type DetectionInput, type DetectionSession, type RecognitionProgress, type RecognitionStage } from "../../lib/entities/recognition";
import { knownTermKeys, normalizeTermKey } from "../../lib/entities/termKey";
import { checkModelCompatibility } from "../../lib/models/compatibility";
import { isModelReady, refreshModels, subscribeModels } from "../../lib/models/manager";
import { NerError } from "../../lib/models/ner/client";
import type { ModelManifest } from "../../lib/models/types";
import { baseLanguage } from "../../lib/subtitle/common/languageCodes";
import { buildPath, navigate } from "../../router/router";
import { createSmoothProgress } from "../../utils/smoothProgress";
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
}

const COMPLETION_LINGER_MS = 500;

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
  const translations = new Map<string, Map<string, string>>();
  let session: DetectionSession | null = null;
  let sessionSignature = "";
  let restoredSignature = "";
  let running: AbortController | null = null;
  let supported = false;
  let status = "";
  let stage: RecognitionStage | null = null;
  let barVisible = false;
  let barIndeterminate = false;
  let barFraction = 0;
  let translatedCount = 0;
  let lastTargetLang: string | null = null;

  const termKey = (source: string): string => normalizeTermKey(source, state.caseSensitiveTerms);

  function cacheFor(language: string): Map<string, string> {
    const existing = translations.get(language);
    if (existing) return existing;
    const created = new Map<string, string>();
    translations.set(language, created);
    return created;
  }

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

  const signatureOf = (target: RecognitionTarget | null): string => (target ? `${target.sourceLang}:${target.files.map(({ id }) => id).join(",")}` : "");

  const inputOf = (target: RecognitionTarget): DetectionInput => ({ files: target.files, sourceLang: target.sourceLang, sdhEnabled: state.sdhEnabled, caseSensitive: state.caseSensitiveTerms, model: target.model });

  function persist(): void {
    if (!session) return;
    const serialized = Object.fromEntries([...translations].map(([language, entries]) => [language, Object.fromEntries(entries)]));
    void saveCheckpoint(snapshotSession(session, glossary.pendingTerms().map(({ source }) => source), serialized));
  }

  function nextAction(): RecognitionAction {
    if (running) return "pause";
    if (session && !isDetectionComplete(session)) return "continue";
    return glossary.pendingTerms().length ? "send" : "detect";
  }

  function view(): RecognitionView {
    const action = nextAction();
    return { supported, action, label: t(ACTION_LABEL_KEYS[action], { count: glossary.pendingTerms().length }), tip: t(ACTION_TIP_KEYS[action]), status };
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
    region.hidden = !current.supported || (!current.status && !barVisible);
    text.textContent = current.status;
    text.hidden = !current.status;
    bar.hidden = !barVisible;
    fill.className = barIndeterminate ? "task-progress-fill task-progress-fill--indeterminate" : "task-progress-fill";
    fill.style.width = barIndeterminate ? "" : `${(barFraction * 100).toFixed(2)}%`;
  }

  const smooth = createSmoothProgress((fraction) => {
    barFraction = fraction;
    paint();
  });

  glossary.attachFooterSlot({
    actionMarkup() {
      const current = view();
      return `<button type="button" class="action-pill action-pill--accent" id="term-recognize-button" data-recognize="${current.action}" ${tipAttr(current.tip)}${current.supported ? "" : " hidden"}>${escapeHtml(current.label)}</button>`;
    },
    statusMarkup() {
      return `<div class="glossary__recognition" id="term-recognize-status" role="status" aria-live="polite" hidden>
        <span class="field__desc" id="term-recognize-text"></span>
        <div class="task-progress-container" id="term-recognize-bar" aria-hidden="true" hidden><div class="task-progress-fill" id="term-recognize-fill"></div></div>
      </div>`;
    },
    mounted: paint,
  });

  function keepControlsInPlace(mutate: () => void): void {
    const before = host.querySelector("#term-recognize-button")?.getBoundingClientRect().top;
    mutate();
    const after = host.querySelector("#term-recognize-button")?.getBoundingClientRect().top;
    if (before === undefined || after === undefined || before < 0 || before > window.innerHeight || Math.abs(after - before) < 1) return;
    window.scrollBy(0, after - before);
  }

  function describeProgress({ stage: current, done, total }: RecognitionProgress): string {
    if (current === "loading") return t("terms.recognize.status.loading");
    return t(current === "recognizing" ? "terms.recognize.status.recognizing" : "terms.recognize.status.translating", { done, total });
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

  const savedFraction = (): number => (session && session.units.length ? session.nextUnit / session.units.length : 0);

  function report(progress: RecognitionProgress): void {
    const resumeFraction = progress.stage === "loading" ? savedFraction() : 0;
    if (progress.stage !== stage) {
      stage = progress.stage;
      smooth.reset(progress.stage === "loading" ? resumeFraction : progress.total ? progress.done / progress.total : 0);
    }
    status = describeProgress(progress);
    barVisible = true;
    barIndeterminate = progress.stage === "loading" && resumeFraction === 0;
    if (progress.stage !== "loading" && progress.total) smooth.set(progress.done / progress.total);
    paint();
  }

  function settle(message: string, completed = false): void {
    status = message;
    stage = null;
    barIndeterminate = false;
    if (completed && barVisible) {
      smooth.finish();
      window.setTimeout(() => {
        if (running) return;
        barVisible = false;
        smooth.reset();
        paint();
      }, COMPLETION_LINGER_MS);
    } else {
      barVisible = false;
      smooth.reset();
    }
    paint();
  }

  function pause(): void {
    if (!running) return;
    running.abort();
    running = null;
    const detecting = session !== null && !isDetectionComplete(session);
    status = detecting ? t("terms.recognize.status.paused", { done: session!.nextUnit, total: session!.units.length }) : describeWaiting();
    if (detecting) smooth.reset(savedFraction());
    else smooth.stop();
    barIndeterminate = false;
    barVisible = barVisible && stage !== "loading";
    paint();
    persist();
  }

  function discardSession(): void {
    session = null;
    sessionSignature = "";
    restoredSignature = "";
    settle("");
  }

  async function detect(target: RecognitionTarget, active: DetectionSession, signal: AbortSignal): Promise<void> {
    await detectTerms(active, target.model, signal, {
      knownKeys: () => knownTermKeys(glossary.getDraftEntries(), state.caseSensitiveTerms),
      onTerms: (sources) => keepControlsInPlace(() => glossary.appendPending(sources)),
      onProgress: (progress) => !signal.aborted && report(progress),
      onCheckpoint: persist,
    });
    glossary.sortRecognized();
  }

  async function translatePending(target: RecognitionTarget, signal: AbortSignal): Promise<void> {
    const pending = glossary.pendingTerms();
    if (!pending.length) return;
    report({ stage: "translating", done: 0, total: pending.length });
    const cache = cacheFor(target.targetLang);
    await translateTerms(pending, { sourceLang: target.sourceLang, targetLang: target.targetLang, provider: state.provider, caseSensitive: state.caseSensitiveTerms }, signal, {
      onTranslated: (terms) => {
        glossary.resolvePending(terms);
        terms.forEach(({ source, target: translation }) => translation !== null && cache.set(termKey(source), translation));
        translatedCount += terms.filter(({ target: translation }) => translation !== null).length;
        persist();
      },
      onProgress: (progress) => !signal.aborted && report(progress),
    });
  }

  function conclude(): void {
    const waiting = glossary.pendingTerms().length;
    const message = waiting
      ? t("terms.recognize.status.partial", { count: translatedCount, failed: waiting })
      : translatedCount
        ? t("terms.recognize.status.done", { count: translatedCount })
        : t("terms.recognize.status.none");
    settle(message, !waiting);
    ctx.announce(message);
    if (!waiting && session && isDetectionComplete(session)) void clearCheckpoint();
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
      persist();
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
      session = createDetectionSession(inputOf(target), null);
      translatedCount = 0;
      void clearCheckpoint();
    }
    sessionSignature = signatureOf(target);
    await run(target, action);
  }

  async function restoreCheckpoint(target: RecognitionTarget): Promise<void> {
    const signature = signatureOf(target);
    if (restoredSignature === signature) return;
    restoredSignature = signature;
    const input = inputOf(target);
    const saved = await loadCheckpoint(createDetectionSession(input, null).fingerprint);
    if (!saved || session || running || ctx.signal.aborted) return;
    session = createDetectionSession(input, saved);
    sessionSignature = signature;
    Object.entries(saved.translations).forEach(([language, entries]) => translations.set(language, new Map(Object.entries(entries))));
    const known = knownTermKeys(glossary.getDraftEntries(), state.caseSensitiveTerms);
    glossary.appendPending(saved.pending.filter((source) => !known.has(termKey(source))));
    settle(isDetectionComplete(session) ? describeWaiting() : t("terms.recognize.status.paused", { done: session.nextUnit, total: session.units.length }));
    if (!isDetectionComplete(session) && session.nextUnit > 0) {
      stage = "recognizing";
      barVisible = true;
      smooth.reset(savedFraction());
      paint();
    }
  }

  function switchTargetLanguage(previous: string, next: string): void {
    pause();
    const stored = cacheFor(previous);
    glossary.recognizedTerms().forEach(({ source, target: translated }) => translated.trim() && stored.set(termKey(source), translated.trim()));
    const fresh = cacheFor(next);
    glossary.retarget((source) => fresh.get(termKey(source)) ?? null);
    const waiting = glossary.pendingTerms().length;
    settle(waiting ? t("terms.recognize.status.retargeted", { count: waiting }) : "");
    persist();
  }

  async function refresh(): Promise<void> {
    const targetLang = ctx.language.targetCode();
    if (lastTargetLang !== null && lastTargetLang !== targetLang) switchTargetLanguage(lastTargetLang, targetLang);
    lastTargetLang = targetLang;
    const target = resolveTarget();
    const available = target !== null && hasUsableFiles(state) && (await checkModelCompatibility()) === null;
    if (ctx.signal.aborted) return;
    supported = available;
    const signature = available ? signatureOf(target) : "";
    if (running && sessionSignature !== signature) pause();
    if (session && sessionSignature !== signature) discardSession();
    paint();
    if (!available || running) return;
    if (!session) await restoreCheckpoint(target);
    if (pendingRecognitionModel() === target.model.id) {
      await refreshModels();
      if (isModelReady(target.model.id)) await activate();
    }
  }

  host.addEventListener("click", (event) => {
    if ((event.target as HTMLElement).closest("#term-recognize-button")) void activate();
  }, { signal: ctx.signal });
  ctx.signal.addEventListener("abort", () => {
    running?.abort();
    smooth.stop();
  }, { once: true });
  const unsubscribe = subscribeModels(() => void refresh());
  ctx.signal.addEventListener("abort", unsubscribe, { once: true });
  void refresh();

  return { refresh: () => void refresh() };
}
