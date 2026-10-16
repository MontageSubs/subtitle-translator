import { t } from "../../i18n";
import { formatWorkerError } from "../../api/translation";
import { updateHistoryJob } from "../../lib/history/history";
import { preloadLineBreakSegmenter } from "../../lib/subtitle/postprocess/lineWrap";
import { noteLocalTranslation } from "../../api/remoteStats";
import { mountConfirmButton } from "../../components/confirmButton";
import { entriesToGlossary } from "../../utils/dictionary";
import { AUTO_DETECT_CODE } from "../../utils/languageProfiles";
import { buildHistorySubtitles } from "./historyBridge";
import { recordHistory } from "./runHistory";
import { prepareRunContext, translateAllFiles, RunContext } from "./translationBatch";
import { hasReusableTranslation, TranslationRequest } from "./translationSignature";
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
    ctx.task.setState("failed", { errorText: formatWorkerError(error), ...counts });
  }

  async function prepareRequest(): Promise<{ request: TranslationRequest; runContext: RunContext }> {
    state.glossaryEntries = ctx.assist.glossary.getEntries();
    const sourceLang = ctx.language.sourceCode();
    const runContext = await prepareRunContext(ctx, sourceLang);
    const request = { sourceLang, targetLang: ctx.language.targetCode(), glossary: entriesToGlossary(state.glossaryEntries), contextText: runContext.contextText };
    return { request, runContext };
  }

  async function presentExistingTranslations(): Promise<void> {
    ctx.log.clear();
    ctx.log.append("[info] Reused existing translations");
    await ctx.result.present(0);
    ctx.announce(t("task.reused"));
    if (state.currentHistoryId) updateHistoryJob(state.currentHistoryId, { subtitles: buildHistorySubtitles(state) }).catch(() => {});
  }

  async function translate(request: TranslationRequest, runContext: RunContext): Promise<void> {
    const controller = new AbortController();
    activeRun = controller;
    stopConfirm.reset();
    stopButton.disabled = false;
    ctx.log.clear();
    ctx.task.setState("processing");
    ctx.progress.begin(state.files);

    try {
      const outcome = await translateAllFiles(ctx, controller.signal, request, runContext);
      if (!state.files.some((file) => file.jobResult)) throw new Error(t("error.allFilesFailed"));
      if (outcome.translatedFiles > 0) noteLocalTranslation();
      if (outcome.actualProvider !== state.provider) {
        ctx.log.append(`[info] Requested provider '${state.provider}', but server routed to '${outcome.actualProvider}'`);
      }
      const elapsedMs = ctx.progress.stop();
      if (request.sourceLang === AUTO_DETECT_CODE && outcome.resolvedSourceLang) {
        ctx.language.setResolvedSource(outcome.resolvedSourceLang);
        ctx.task.updateHeader();
      }
      ctx.progress.showMerging();
      await ctx.result.present(elapsedMs);
      recordHistory(ctx, outcome);
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
    preloadLineBreakSegmenter(ctx.language.targetCode());
    startButton.disabled = true;
    try {
      const { request, runContext } = await prepareRequest();
      if (state.files.every((file) => hasReusableTranslation(state, file, request))) await presentExistingTranslations();
      else await translate(request, runContext);
    } catch (error) {
      reportFailure(error);
    } finally {
      startButton.disabled = false;
    }
  }

  startButton.addEventListener("click", () => { void run(); }, { signal });
}
