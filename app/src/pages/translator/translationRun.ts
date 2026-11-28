import { t } from "../../i18n";
import { ALLOWANCE_EXHAUSTED_CODE, formatWorkerError, isCoolingDown, isNetworkFailure, isOutdatedClient, isWorkerLimit, LocalizedError, onTranslationSuccess, translationHoldUntil, WorkerRequestError } from "../../api/translation";
import { beginTaskRun, endTaskRun, exhaustedRescue, followTaskChannel, noteTaskLimited, noteTaskRequestSucceeded, toggleRescue } from "./translationTask";
import { updateHistoryJob } from "../../lib/history/history";
import { preloadLineBreakSegmenter } from "../../lib/subtitle/postprocess/lineWrap";
import { noteLocalTranslation } from "../../api/remoteStats";
import { mountConfirmButton } from "../../components/confirmButton";
import { buildHistorySubtitles } from "./historyBridge";
import { recordHistory } from "./runHistory";
import { prepareRunContexts, translateAllFiles, RunContext, RunOutcome } from "./translationBatch";
import { isSettledForRun, totalUnfinishedCues } from "./fileCompletion";
import type { PartialNotice } from "./resultPanel";
import { submissionBlocker } from "./fileValidation";
import type { WorkspaceContext } from "./context";

export function mountTranslationRun(ctx: WorkspaceContext): void {
  const { state, signal } = ctx;
  const startButton = ctx.query<HTMLButtonElement>("#start");
  const stopButton = ctx.query<HTMLButtonElement>("#task-stop-btn");
  let activeRun: AbortController | null = null;

  const stopCountingSuccess = onTranslationSuccess(() => noteTaskRequestSucceeded(state));
  signal.addEventListener("abort", stopCountingSuccess, { once: true });

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

  function reportFailure(error: unknown, runSignal?: AbortSignal, alreadyLogged = false): void {
    if (runSignal?.aborted) {
      if (!alreadyLogged) ctx.log.append("[info] Job cancelled by user.");
      ctx.task.setState("failed", { errorText: t("error.cancelled") });
      return;
    }
    if (!alreadyLogged) ctx.log.append(`[error] Translation failed: ${error instanceof Error ? error.message : String(error)}`);
    ctx.task.setState("failed", { errorText: formatWorkerError(error), cooldown: isCoolingDown(error), networkFailure: isNetworkFailure(error), updateRequired: isOutdatedClient(error) });
  }

  function partialNotice(outcome: RunOutcome, aborted: boolean): PartialNotice | undefined {
    if (aborted) return { text: t("error.cancelled"), cooldown: false, networkFailure: false, updateRequired: false };
    const [failure] = outcome.failures;
    return failure ? { text: formatWorkerError(failure.error), cooldown: isCoolingDown(failure.error), networkFailure: isNetworkFailure(failure.error), updateRequired: isOutdatedClient(failure.error) } : undefined;
  }

  async function presentExistingTranslations(): Promise<void> {
    ctx.log.clear();
    ctx.log.append("[info] Reused existing translations");
    await ctx.result.present(0);
    ctx.announce(t("task.reused"));
    if (state.currentHistoryId) updateHistoryJob(state.currentHistoryId, { subtitles: buildHistorySubtitles(state), incomplete: undefined }).catch(() => {});
    state.historyIncomplete = false;
  }

  async function translate(runContexts: Map<string, RunContext>, resume: boolean): Promise<void> {
    const controller = new AbortController();
    activeRun = controller;
    stopConfirm.reset();
    stopButton.disabled = false;
    ctx.log.clear();
    ctx.task.setState("processing");
    ctx.progress.begin(state.files, (file) => isSettledForRun(state, file, resume), resume);
    const task = beginTaskRun(state);
    let failed = false;

    try {
      const outcome = await translateAllFiles(ctx, controller.signal, runContexts, resume);
      const elapsedMs = ctx.progress.stop();
      if (outcome.failures.some(({ error }) => isWorkerLimit(error))) noteTaskLimited(task);
      if (exhaustedRescue(task) && !outcome.failures.length && totalUnfinishedCues(state.files) > 0) {
        outcome.failures.push({ filename: "", error: new WorkerRequestError(ALLOWANCE_EXHAUSTED_CODE, { code: ALLOWANCE_EXHAUSTED_CODE }) });
      }
      failed = !controller.signal.aborted && outcome.failures.length > 0;
      if (!state.files.some((file) => file.jobResult)) {
        reportFailure(outcome.failures[0]?.error ?? new LocalizedError("all files failed", "error.allFilesFailed"), controller.signal, outcome.failures.length > 0);
        return;
      }
      if (outcome.translatedFiles > 0) noteLocalTranslation();
      if (outcome.actualProvider !== state.provider) {
        ctx.log.append(`[info] Requested provider '${state.provider}', but server routed to '${outcome.actualProvider}'`);
      }
      ctx.language.adoptResolvedSources();
      ctx.progress.showMerging();
      const notice = partialNotice(outcome, controller.signal.aborted);
      endTaskRun(state, task, failed);
      await ctx.result.present(elapsedMs, notice);
      void recordHistory(ctx, outcome);
    } catch (error) {
      failed = !controller.signal.aborted;
      ctx.progress.stop();
      reportFailure(error, controller.signal);
    } finally {
      if (task.running) endTaskRun(state, task, failed);
      stopConfirm.reset();
      activeRun = null;
    }
  }

  async function run(resume: boolean): Promise<void> {
    followTaskChannel(state);
    if (!state.files.length || translationHoldUntil() !== null) return;
    const blocker = submissionBlocker(state);
    if (blocker) {
      ctx.task.setState("failed", { errorText: blocker, completedCount: 0, totalCount: state.files.length });
      return;
    }
    if (await ctx.historyGate.isFull()) {
      await ctx.historyGate.sync(true);
      return;
    }
    preloadLineBreakSegmenter(ctx.language.targetCode());
    startButton.disabled = true;
    try {
      state.glossaryEntries = ctx.assist.glossary.getEntries();
      const runContexts = await prepareRunContexts(ctx, ctx.language.sourceCode());
      if (state.files.every((file) => isSettledForRun(state, file, resume))) await presentExistingTranslations();
      else await translate(runContexts, resume);
    } catch (error) {
      reportFailure(error);
    } finally {
      ctx.task.updateHeader();
    }
  }

  ctx.root.querySelectorAll<HTMLButtonElement>("[data-rescue-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      toggleRescue(state);
      ctx.task.updateHeader();
    }, { signal });
  });
  startButton.addEventListener("click", () => { void run(false); }, { signal });
  ctx.query<HTMLButtonElement>("#task-resume-btn").addEventListener("click", () => { void run(true); }, { signal });
}
