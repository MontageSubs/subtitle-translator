import { t } from "../../i18n";
import { completeTranslateJob, formatWorkerError, TranslateJobResponse } from "../../api/translation";
import { saveHistoryJob } from "../../lib/history/history";
import { applySdhStripping } from "../../lib/subtitle/extraction/sdh";
import { preloadLineBreakSegmenter } from "../../lib/subtitle/postprocess/lineWrap";
import { noteLocalTranslation } from "../../api/remoteStats";
import { supportsContext } from "../../components/contextInput";
import { mountConfirmButton } from "../../components/confirmButton";
import { CONTEXT_MAX_CHARS, validateContext } from "../../utils/context";
import { entriesToGlossary } from "../../utils/dictionary";
import { AUTO_DETECT_CODE } from "../../utils/languageProfiles";
import { buildHistorySubtitles } from "./historyBridge";
import { fileCountLabel, SubtitleFile } from "./state";
import type { WorkspaceContext } from "./context";

interface RunContext {
  contextText?: string;
  contextNeedsTranslation: boolean;
}

interface RunOutcome {
  resolvedSourceLang: string;
  actualProvider: string;
}

async function prepareRunContext(ctx: WorkspaceContext, sourceLang: string): Promise<RunContext> {
  const { state } = ctx;
  if (!state.contextText.trim() || !supportsContext(state.provider)) return { contextNeedsTranslation: false };
  const validation = await validateContext(state.contextText, sourceLang);
  ctx.assist.context.setHint(
    validation.needsTranslation
      ? t("context.willTranslate", { code: validation.detectedCode || "?" })
      : validation.truncated ? t("context.tooLong", { max: CONTEXT_MAX_CHARS }) : ""
  );
  return { contextText: validation.text || undefined, contextNeedsTranslation: validation.needsTranslation };
}

function toWireCues(file: SubtitleFile, sourceLang: string, stripSdh: boolean) {
  const { cues } = applySdhStripping(file.cues, sourceLang, stripSdh);
  return cues.map((cue) => ({ ...cue, text: cue.text.replace(/\n+/g, " ").trim() }));
}

async function translateAllFiles(ctx: WorkspaceContext, signal: AbortSignal, glossary: Record<string, string>, runContext: RunContext): Promise<RunOutcome> {
  const { state } = ctx;
  const sourceLang = ctx.language.sourceCode();
  const targetLang = ctx.language.targetCode();
  let resolvedSourceLang = sourceLang;
  let actualProvider = state.provider;
  let sourceResolved = false;

  for (const [index, file] of state.files.entries()) {
    ctx.progress.beginFile(index, file.filename);
    const cues = toWireCues(file, sourceLang, state.sdhEnabled);
    const job: TranslateJobResponse = await completeTranslateJob(
      {
        cues,
        glossary,
        source: sourceLang,
        target: targetLang,
        provider: state.provider,
        sceneChangeSeconds: state.sceneSeconds,
        caseSensitiveTerms: state.caseSensitiveTerms,
        ...runContext,
      },
      {
        onLog: ctx.log.append,
        onProgress: (chunk) => {
          if (cues.length > 0 && chunk.cues) {
            ctx.progress.report(chunk.cues.filter((cue) => cue.translation !== null).length, cues.length);
          }
        },
        signal,
      }
    );
    ctx.progress.completeFile(cues.length);
    if (!job.success) {
      ctx.log.append(`[warn] ${t("error.translationEmpty", { name: file.filename })}`);
      continue;
    }
    file.jobResult = job;
    file.renderMode = state.outputMode;
    file.stacking = state.stackingOrder;
    file.musicTopAlign = state.musicTopAlign;
    if (!sourceResolved) {
      resolvedSourceLang = job.resolved_source_lang || sourceLang;
      sourceResolved = true;
    }
    if (job.provider) actualProvider = job.provider;
  }
  return { resolvedSourceLang, actualProvider };
}

function recordHistory(ctx: WorkspaceContext, outcome: RunOutcome, glossary: Record<string, string>): void {
  const { state } = ctx;
  const subtitles = buildHistorySubtitles(state);
  const [first] = subtitles;
  saveHistoryJob({
    engine: "nmt",
    provider: outcome.actualProvider,
    title: subtitles.length === 1 ? first.translatedFilename! : fileCountLabel(subtitles.length),
    sourceFilename: first?.sourceFilename,
    translatedFilename: first?.translatedFilename,
    sourceLang: outcome.resolvedSourceLang,
    targetLang: ctx.language.targetCode(),
    subtitles,
    glossary: Object.keys(glossary).length ? glossary : undefined,
    contextText: state.contextText,
    caseSensitiveTerms: state.caseSensitiveTerms,
    stripSdh: state.sdhEnabled,
    sceneSeconds: state.sceneSeconds,
  }).then((id) => {
    state.currentHistoryId = id;
    ctx.stats.refreshLocalCount();
  }).catch(() => {});
}

export function mountTranslationRun(ctx: WorkspaceContext): void {
  const { state, signal } = ctx;
  const startButton = ctx.query<HTMLButtonElement>("#start");
  const stopButton = ctx.query<HTMLButtonElement>("#task-stop-btn");
  let activeRun: AbortController | null = null;

  const stopConfirm = mountConfirmButton({
    button: stopButton,
    label: ctx.query<HTMLElement>("#task-stop-label"),
    idleText: () => t("task.stop"),
    confirmText: () => t("task.stopConfirm"),
    onConfirm: () => {
      if (!activeRun) return;
      stopButton.disabled = true;
      activeRun.abort();
      activeRun = null;
    },
    signal,
  });

  function reportFailure(error: unknown, runSignal: AbortSignal): void {
    const counts = { completedCount: ctx.progress.fileIndex, totalCount: state.files.length };
    if (runSignal.aborted) {
      ctx.log.append("[info] Job cancelled by user.");
      ctx.task.setState("failed", { errorText: t("error.cancelled"), ...counts });
      return;
    }
    ctx.log.append(`[error] Translation failed: ${error instanceof Error ? error.message : String(error)}`);
    ctx.task.setState("failed", { errorText: formatWorkerError(error), ...counts });
  }

  async function run(): Promise<void> {
    if (!state.files.length) return;
    const targetLang = ctx.language.targetCode();
    const sourceLang = ctx.language.sourceCode();
    preloadLineBreakSegmenter(targetLang);

    const controller = new AbortController();
    activeRun = controller;
    stopConfirm.reset();
    startButton.disabled = true;
    stopButton.disabled = false;
    ctx.log.clear();
    ctx.task.setState("processing");
    ctx.progress.begin(state.files);

    try {
      state.glossaryEntries = ctx.assist.glossary.getEntries();
      const glossary = entriesToGlossary(state.glossaryEntries);
      const runContext = await prepareRunContext(ctx, sourceLang);
      const outcome = await translateAllFiles(ctx, controller.signal, glossary, runContext);
      if (!state.files.some((file) => file.jobResult)) throw new Error(t("error.allFilesFailed"));
      noteLocalTranslation();
      if (outcome.actualProvider !== state.provider) {
        ctx.log.append(`[info] Requested provider '${state.provider}', but server routed to '${outcome.actualProvider}'`);
      }
      const elapsedMs = ctx.progress.stop();
      if (sourceLang === AUTO_DETECT_CODE && outcome.resolvedSourceLang) {
        ctx.language.setResolvedSource(outcome.resolvedSourceLang);
        ctx.task.updateHeader();
      }
      ctx.progress.showMerging();
      await ctx.result.present(elapsedMs);
      recordHistory(ctx, outcome, glossary);
    } catch (error) {
      ctx.progress.stop();
      reportFailure(error, controller.signal);
    } finally {
      stopConfirm.reset();
      activeRun = null;
      startButton.disabled = false;
    }
  }

  startButton.addEventListener("click", () => { void run(); }, { signal });
}
