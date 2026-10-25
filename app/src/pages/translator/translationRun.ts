import { t } from "../../i18n";
import { formatWorkerError, LocalizedError, needsFeedbackLink } from "../../api/translation";
import { updateHistoryJob } from "../../lib/history/history";
import { preloadLineBreakSegmenter } from "../../lib/subtitle/postprocess/lineWrap";
import { noteLocalTranslation } from "../../api/remoteStats";
import { mountConfirmButton } from "../../components/confirmButton";
import { buildHistorySubtitles } from "./historyBridge";
import { recordHistory } from "./runHistory";
import { prepareRunContext, translateAllFiles, RunContext, RunOutcome } from "./translationBatch";
import { hasReusableTranslation } from "./translationSignature";
import { submissionBlocker } from "./fileValidation";
import type { WorkspaceContext } from "./context";

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

  function reportFailure(error: unknown, runSignal?: AbortSignal): void {
    const counts = { completedCount: ctx.progress.fileIndex, totalCount: state.files.length };
    if (runSignal?.aborted) {
      ctx.log.append("[info] Job cancelled by user.");
      ctx.task.setState("failed", { errorText: t("error.cancelled"), ...counts });
      return;
    }
    ctx.log.append(`[error] Translation failed: ${error instanceof Error ? error.message : String(error)}`);
    ctx.task.setState("failed", { errorText: formatWorkerError(error), feedbackLink: needsFeedbackLink(error), ...counts });
  }

  function partialNotice(outcome: RunOutcome, aborted: boolean): string | undefined {
    if (aborted) return t("error.cancelled");
    const [failure] = outcome.failures;
    return failure ? formatWorkerError(failure.error) : undefined;
  }

  async function presentExistingTranslations(): Promise<void> {
    ctx.log.clear();
    ctx.log.append("[info] Reused existing translations");
    await ctx.result.present(0);
    ctx.announce(t("task.reused"));
    if (state.currentHistoryId) updateHistoryJob(state.currentHistoryId, { subtitles: buildHistorySubtitles(state), incomplete: undefined }).catch(() => {});
    state.historyIncomplete = false;
  }

  async function translate(runContext: RunContext): Promise<void> {
    const controller = new AbortController();
    activeRun = controller;
    stopConfirm.reset();
    stopButton.disabled = false;
    ctx.log.clear();
    ctx.task.setState("processing");
    ctx.progress.begin(state.files);

    try {
      const outcome = await translateAllFiles(ctx, controller.signal, runContext);
      const elapsedMs = ctx.progress.stop();
      if (!state.files.some((file) => file.jobResult)) {
        reportFailure(outcome.failures[0]?.error ?? new LocalizedError("all files failed", "error.allFilesFailed"), controller.signal);
        return;
      }
      if (outcome.translatedFiles > 0) noteLocalTranslation();
      if (outcome.actualProvider !== state.provider) {
        ctx.log.append(`[info] Requested provider '${state.provider}', but server routed to '${outcome.actualProvider}'`);
      }
      ctx.language.adoptResolvedSources();
      ctx.progress.showMerging();
      await ctx.result.present(elapsedMs, partialNotice(outcome, controller.signal.aborted));
      void recordHistory(ctx, outcome);
    } catch (error) {
      ctx.progress.stop();
      reportFailure(error, controller.signal);
    } finally {
      stopConfirm.reset();
      activeRun = null;
    }
  }

  async function run(): Promise<void> {
    if (!state.files.length) return;
    const blocker = submissionBlocker(state);
    if (blocker) {
      ctx.task.setState("failed", { errorText: blocker, completedCount: 0, totalCount: state.files.length });
      return;
    }
    if (await ctx.historyGate.isFull()) {
      await ctx.historyGate.sync();
      return;
    }
    preloadLineBreakSegmenter(ctx.language.targetCode());
    startButton.disabled = true;
    try {
      state.glossaryEntries = ctx.assist.glossary.getEntries();
      const runContext = await prepareRunContext(ctx, ctx.language.sourceCode());
      if (state.files.every((file) => hasReusableTranslation(state, file))) await presentExistingTranslations();
      else await translate(runContext);
    } catch (error) {
      reportFailure(error);
    } finally {
      startButton.disabled = false;
    }
  }

  startButton.addEventListener("click", () => { void run(); }, { signal });
}
