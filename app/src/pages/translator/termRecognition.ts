import { formatWorkerError } from "../../api/translation/errors";
import { getLocale, t, type TranslationKey } from "../../i18n";
import { clearCheckpoint, loadCheckpoint, saveCheckpoint } from "../../lib/entities/checkpoint";
import { clearPendingRecognition, deferRecognitionUntilModelReady, pendingRecognitionModel } from "../../lib/entities/pendingRecognition";
import { createDetectionSession, detectTerms, isDetectionComplete, isTermsUnsupportedByService, nerModelFor, snapshotSession, translateTerms, type DetectionInput, type DetectionSession, type RecognitionProgress } from "../../lib/entities/recognition";
import { knownTermKeys, normalizeTermKey } from "../../lib/entities/termKey";
import { modelAnchor } from "../../lib/models/catalog";
import { checkModelCompatibility } from "../../lib/models/compatibility";
import { ensureModelsInspected, isModelReady, refreshModels, subscribeModels } from "../../lib/models/manager";
import { installedModel } from "../../lib/models/selection";
import { ModelError, warmModel, type ModelErrorCode } from "../../lib/models/runtime/modelRuntime";
import type { ModelManifest } from "../../lib/models/types";
import { baseLanguage } from "../../lib/subtitle/common/languageCodes";
import { buildPath, navigate } from "../../router/router";
import { createSmoothProgress } from "../../utils/smoothProgress";
import { AUTO_DETECT_CODE } from "../../utils/languageProfiles";
import type { WorkspaceContext } from "./context";
import { fileProblem, hasUsableFiles } from "./fileValidation";
import type { SubtitleFile } from "./state";
import { createRecognitionPanel, type PrimaryAction, type RecognitionAction, type SecondaryAction } from "./termRecognitionPanel";

export interface TermRecognitionHandle {
  refresh(): void;
  suspend(): void;
}

interface RecognitionTarget {
  model: ModelManifest;
  sourceLang: string;
  targetLang: string;
  files: SubtitleFile[];
}

const COMPLETION_LINGER_MS = 500;

const MODEL_FAILURE_KEYS: Partial<Record<ModelErrorCode, TranslationKey>> = {
  memory: "terms.recognize.error.memory",
  incompatible: "terms.recognize.error.incompatible",
  runtime: "terms.recognize.error.runtime",
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
  let barVisible = false;
  let barIndeterminate = false;
  let barFraction = 0;
  let translatedCount = 0;
  let lastTargetLang: string | null = null;
  let refreshTicket = 0;

  const termKey = (source: string): string => normalizeTermKey(source, state.caseSensitiveTerms);

  function cacheFor(language: string): Map<string, string> {
    const existing = translations.get(language);
    if (existing) return existing;
    const created = new Map<string, string>();
    translations.set(language, created);
    return created;
  }

  function resolveTarget(): RecognitionTarget | null {
    const usable = ctx.assist.recognitionFiles().filter((file) => fileProblem(file) === null);
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

  const detectionPending = (): boolean => session !== null && !isDetectionComplete(session);

  const persistUnfinished = (): void => {
    if (detectionPending() || glossary.pendingTerms().length) persist();
  };

  function primaryAction(): PrimaryAction {
    if (running) return "pause";
    return detectionPending() ? "continue" : "detect";
  }

  function secondaryAction(): SecondaryAction | null {
    if (running) return null;
    if (detectionPending()) return "cancel";
    if (glossary.pendingTerms().length) return "send";
    return glossary.recognizedTerms().length ? "retranslate" : null;
  }

  const panel = createRecognitionPanel(host, () => ({
    supported,
    action: primaryAction(),
    redetect: primaryAction() === "detect" && session !== null,
    secondary: secondaryAction(),
    status,
    barVisible,
    barIndeterminate,
    barFraction,
  }));
  const paint = panel.paint;

  const smooth = createSmoothProgress((fraction) => {
    barFraction = fraction;
    panel.paintBar();
  });

  glossary.attachFooterSlot(panel.slot);

  function keepControlsInPlace(mutate: () => void): void {
    const before = host.querySelector("#term-recognize-button")?.getBoundingClientRect().top;
    mutate();
    const after = host.querySelector("#term-recognize-button")?.getBoundingClientRect().top;
    if (before === undefined || after === undefined || before < 0 || before > window.innerHeight || Math.abs(after - before) < 1) return;
    window.scrollBy(0, after - before);
  }

  function describeProgress({ stage: current, done, total, skipped, accelerated }: RecognitionProgress): string {
    if (current === "loading") return t("terms.recognize.status.loading");
    if (current === "recognizing") return t(skipped ? "terms.recognize.status.recognizingSkipped" : "terms.recognize.status.recognizing", { done, total, skipped: skipped ?? 0 }) + (accelerated ? t("terms.recognize.status.accelerated") : "");
    return t("terms.recognize.status.translating", { done, total });
  }

  function describeFailure(error: unknown): string {
    console.error(error instanceof ModelError ? (error.origin ?? error) : error);
    if (error instanceof ModelError) return t(MODEL_FAILURE_KEYS[error.code] ?? "terms.recognize.error.model");
    if (isTermsUnsupportedByService(error)) return t("terms.recognize.error.service");
    return formatWorkerError(error);
  }

  function describeWaiting(): string {
    const waiting = glossary.pendingTerms().length;
    return waiting ? t("terms.recognize.status.pending", { count: waiting }) : "";
  }

  const savedFraction = (): number => (session && session.units.length ? session.nextUnit / session.units.length : 0);

  function report(progress: RecognitionProgress): void {
    status = describeProgress(progress);
    barVisible = true;
    barIndeterminate = progress.stage === "loading" && smooth.value() === 0;
    if (progress.stage !== "loading" && progress.total) smooth.set(progress.done / progress.total);
    paint();
  }

  function settle(message: string, completed = false): void {
    status = message;
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
    smooth.stop();
    barVisible = barVisible && !barIndeterminate;
    barIndeterminate = false;
    paint();
    persist();
  }

  function discardSession(): void {
    session = null;
    sessionSignature = "";
    restoredSignature = "";
    settle("");
  }

  async function cancel(): Promise<void> {
    if (running || !detectionPending()) return;
    discardSession();
    await clearCheckpoint();
    const message = `${t("terms.recognize.status.cancelled")} ${describeWaiting()}`.trim();
    settle(message);
    ctx.announce(message);
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
    smooth.reset();
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

  function conclude(message: string, completed: boolean): void {
    settle(message, completed);
    ctx.announce(message);
    if (!glossary.pendingTerms().length && session && isDetectionComplete(session)) void clearCheckpoint();
  }

  function concludeDetection(): void {
    conclude(describeWaiting() || t("terms.recognize.status.none"), true);
  }

  function concludeTranslation(): void {
    const waiting = glossary.pendingTerms().length;
    const message = waiting
      ? t("terms.recognize.status.partial", { count: translatedCount, failed: waiting })
      : translatedCount
        ? t("terms.recognize.status.done", { count: translatedCount })
        : t("terms.recognize.status.none");
    conclude(message, !waiting);
  }

  async function run(target: RecognitionTarget, action: RecognitionAction): Promise<void> {
    const controller = new AbortController();
    running = controller;
    paint();
    try {
      if (action === "send" || action === "retranslate") {
        if (action === "retranslate") glossary.requeueRecognized();
        await translatePending(target, controller.signal);
        concludeTranslation();
      } else if (session) {
        await detect(target, session, controller.signal);
        concludeDetection();
      }
    } catch (error) {
      if (!controller.signal.aborted) settle(`${describeFailure(error)} ${describeWaiting()}`.trim());
      persist();
    } finally {
      if (running === controller) running = null;
      paint();
    }
  }

  async function activate(action: RecognitionAction): Promise<void> {
    if (action === "pause") return pause();
    if (action === "cancel") return cancel();
    const target = resolveTarget();
    if (!target) return;
    if (action === "send" || action === "retranslate") translatedCount = 0;
    else {
      if (!isModelReady(target.model.id)) await refreshModels();
      if (!isModelReady(target.model.id)) {
        deferRecognitionUntilModelReady(target.model.id);
        navigate(`${buildPath(getLocale(), "models")}#${modelAnchor(target.model)}`);
        return;
      }
      clearPendingRecognition();
    }
    if (action === "detect") {
      session = createDetectionSession(inputOf(target), null);
      translatedCount = 0;
      smooth.reset();
      barVisible = false;
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

  function warmTarget(target: RecognitionTarget): void {
    if (isModelReady(target.model.id)) warmModel(target.model);
    const lexicon = installedModel("lexicon", baseLanguage(target.sourceLang));
    if (lexicon) warmModel(lexicon);
  }

  async function refresh(): Promise<void> {
    const ticket = ++refreshTicket;
    const targetLang = ctx.language.targetCode();
    if (lastTargetLang !== null && lastTargetLang !== targetLang) switchTargetLanguage(lastTargetLang, targetLang);
    lastTargetLang = targetLang;
    await ensureModelsInspected().catch(() => undefined);
    const target = resolveTarget();
    const available = target !== null && hasUsableFiles(state) && (await checkModelCompatibility(target.model)) === null;
    if (ctx.signal.aborted || ticket !== refreshTicket) return;
    supported = available;
    const signature = available ? signatureOf(target) : "";
    if (running && sessionSignature !== signature) pause();
    if (session && sessionSignature !== signature) discardSession();
    paint();
    if (!available || running) return;
    if (!session) await restoreCheckpoint(target);
    if (ctx.signal.aborted || ticket !== refreshTicket) return;
    warmTarget(target);
    if (pendingRecognitionModel() === target.model.id) {
      if (!isModelReady(target.model.id)) await refreshModels();
      if (isModelReady(target.model.id)) await activate(primaryAction());
    }
  }

  const warmOnIntent = (event: Event): void => {
    if (!(event.target as HTMLElement).closest("#term-recognize-button") || running) return;
    const target = resolveTarget();
    if (target) warmTarget(target);
  };
  ["pointerover", "focusin", "touchstart"].forEach((type) => host.addEventListener(type, warmOnIntent, { signal: ctx.signal, passive: true }));

  host.addEventListener("click", (event) => {
    const action = (event.target as HTMLElement).closest<HTMLElement>("[data-recognize]")?.dataset.recognize;
    if (action) void activate(action as RecognitionAction);
  }, { signal: ctx.signal });
  ctx.signal.addEventListener("abort", () => {
    persistUnfinished();
    running?.abort();
    smooth.stop();
  }, { once: true });
  document.addEventListener("visibilitychange", () => (document.visibilityState === "hidden" ? persistUnfinished() : void refresh()), { signal: ctx.signal });
  window.addEventListener("pagehide", persistUnfinished, { signal: ctx.signal });
  const unsubscribe = subscribeModels(() => void refresh());
  ctx.signal.addEventListener("abort", unsubscribe, { once: true });
  void refresh();

  return { refresh: () => void refresh(), suspend: pause };
}
