import { scopedQuery } from "../../utils/dom";
import { getLocale, t } from "../../i18n";
import { HistorySummary, deleteHistoryJob, getHistoryId, getHistoryJob, listHistorySummaries, updateHistoryJob } from "../../lib/history/history";
import { CLEAR_ALL_KEY, DELETION_UNDO_WINDOW_MS, cancelDeletion, deletionRemainingMs, isDeletionQueued, jobDeletionKey, queueDeletion, subscribeDeletionSettled } from "../../lib/history/deletionQueue";
import { requestHistoryRestore } from "../../lib/history/historyRestore";
import { hasUnsavedChanges, resetUnsavedChanges } from "../../lib/unsavedChanges";
import { setPageMeta } from "../../config/head";
import { buildPath, navigate } from "../../router/router";
import { HOME_PAGE_ID } from "../../render/paths";
import { mapWithConcurrency } from "../../utils/concurrency";
import { offlineSearchMatch } from "../../utils/offlineSearch";
import { downloadJob, downloadSubtitle } from "./exports";
import { HistoryToolbarHandle, mountHistoryToolbar } from "./historyToolbar";
import { renderJobRow } from "./jobRow";
import { renderHistoryPage } from "./pageMarkup";
import { openSubtitlePreview } from "./previewBridge";

const SEARCH_LOAD_CONCURRENCY = 4;

async function restoreJob(id: string): Promise<void> {
  if (hasUnsavedChanges() && !window.confirm(t("preview.unsavedWarning"))) return;
  const job = await getHistoryJob(id);
  if (!job) return;
  resetUnsavedChanges();
  requestHistoryRestore(job);
  navigate(buildPath(getLocale(), HOME_PAGE_ID));
}

export function mount(container: HTMLElement, signal: AbortSignal): void {
  setPageMeta(t("nav.history"), t("meta.history.description"));
  container.innerHTML = renderHistoryPage();

  const query = scopedQuery(container);
  const list = query<HTMLElement>("#history-list");
  const matchCount = query<HTMLElement>("#history-match-count");
  const searchInput = query<HTMLInputElement>("#history-search-input");
  const searchClear = query<HTMLButtonElement>("#history-search-clear");

  let toolbar: HistoryToolbarHandle | undefined;
  const expandedIds = new Set<string>();
  let countdownTicker: number | undefined;
  let renamingId: string | null = null;
  let visibleJobs: HistorySummary[] = [];
  const searchIndex = new Map<string, { updatedAt: number; text: Promise<string> }>();

  const findJob = (id: string | undefined) => visibleJobs.find((job) => job.id === id);

  function searchableContent(summary: HistorySummary): Promise<string> {
    const cached = searchIndex.get(summary.id);
    if (cached?.updatedAt === summary.updatedAt) return cached.text;
    const text = getHistoryJob(summary.id).then((job) => job?.subtitles.flatMap((subtitle) => subtitle.cues.flatMap((cue) => [cue.sourceText, cue.translatedText])).join("\n") ?? "");
    searchIndex.set(summary.id, { updatedAt: summary.updatedAt, text });
    return text;
  }

  async function filterJobs(jobs: HistorySummary[], keyword: string): Promise<HistorySummary[]> {
    const matches = await mapWithConcurrency(jobs, SEARCH_LOAD_CONCURRENCY, async (job) =>
      offlineSearchMatch(keyword, job.title) || offlineSearchMatch(keyword, await searchableContent(job)));
    return jobs.filter((_, index) => matches[index]);
  }

  const isDeletePending = (jobId: string): boolean => isDeletionQueued(jobDeletionKey(jobId));

  const undoSecondsOf = (jobId: string): number => Math.max(1, Math.ceil(deletionRemainingMs(jobDeletionKey(jobId)) / 1000));

  function stopCountdownTicker(): void {
    window.clearInterval(countdownTicker);
    countdownTicker = undefined;
  }

  function tickCountdowns(): void {
    const pendingIds = visibleJobs.map((job) => job.id).filter(isDeletePending);
    pendingIds.forEach((jobId) => {
      const button = list.querySelector<HTMLElement>(`[data-delete="${jobId}"]`);
      if (button) button.textContent = t("common.undoCountdown", { seconds: undoSecondsOf(jobId) });
    });
    if (!pendingIds.length) stopCountdownTicker();
  }

  function deferDelete(jobId: string): void {
    queueDeletion(jobDeletionKey(jobId), DELETION_UNDO_WINDOW_MS, () => deleteHistoryJob(jobId));
  }

  function showMessage(messageKey: "history.empty" | "history.noResults"): void {
    list.innerHTML = `<p class="muted history-empty">${t(messageKey)}</p>`;
  }

  async function render(): Promise<void> {
    const currentHistoryId = getHistoryId();
    const allJobs = isDeletionQueued(CLEAR_ALL_KEY) ? [] : await listHistorySummaries();
    toolbar?.syncAvailability(allJobs.length > 0);
    const keyword = searchInput.value;
    const trimmed = keyword.trim();
    if (!allJobs.length) {
      matchCount.textContent = "";
      visibleJobs = [];
      showMessage("history.empty");
      return;
    }

    const matched = trimmed ? await filterJobs(allJobs, keyword) : allJobs;
    if (keyword !== searchInput.value) return;
    visibleJobs = matched;
    matchCount.textContent = trimmed ? t("history.matchCount", { count: visibleJobs.length }) : "";
    if (!visibleJobs.length) {
      showMessage("history.noResults");
      return;
    }

    list.innerHTML = visibleJobs.map((job) => renderJobRow(job, {
      expanded: expandedIds.has(job.id),
      renaming: renamingId === job.id,
      undoSeconds: undoSecondsOf(job.id),
      deletePending: isDeletePending(job.id),
      imported: Boolean(job.historyId && job.historyId !== currentHistoryId),
    })).join("");
    if (visibleJobs.some((job) => isDeletePending(job.id))) countdownTicker ??= window.setInterval(tickCountdowns, 250);
    const renameInput = list.querySelector<HTMLInputElement>("[data-rename-input]");
    renameInput?.focus();
    renameInput?.select();
  }

  async function commitRename(job: HistorySummary, input: HTMLInputElement): Promise<void> {
    const title = input.value.trim() || job.files[0]?.name || job.title;
    renamingId = null;
    if (title !== job.title) await updateHistoryJob(job.id, { title });
    await render();
  }

  function activateRow(job: HistorySummary): void {
    if (job.files.length === 1) {
      void openSubtitlePreview(job.id, job.files[0].id);
      return;
    }
    if (!expandedIds.delete(job.id)) expandedIds.add(job.id);
    void render();
  }

  async function toggleDelete(jobId: string): Promise<void> {
    if (isDeletePending(jobId)) cancelDeletion(jobDeletionKey(jobId));
    else deferDelete(jobId);
    await render();
  }

  function dispatchAction(button: HTMLElement): void {
    const { dataset } = button;
    const rowJob = findJob(button.closest<HTMLElement>("[data-job-id]")?.dataset.jobId);
    if (dataset.rename) {
      renamingId = dataset.rename;
      void render();
    } else if (dataset.restore) {
      void restoreJob(dataset.restore);
    } else if (dataset.download) {
      void getHistoryJob(dataset.download).then((job) => job && downloadJob(job));
    } else if (dataset.delete) {
      void toggleDelete(dataset.delete);
    } else if (dataset.subPreview && rowJob) {
      void openSubtitlePreview(rowJob.id, dataset.subPreview);
    } else if (dataset.subDownload && rowJob) {
      const subtitleId = dataset.subDownload;
      void getHistoryJob(rowJob.id).then((job) => {
        const subtitle = job?.subtitles.find((candidate) => candidate.id === subtitleId);
        if (job && subtitle) downloadSubtitle(job, subtitle);
      });
    }
  }

  list.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    if (target.closest("[data-rename-input]")) return;
    const action = target.closest<HTMLElement>("[data-rename], [data-restore], [data-download], [data-delete], [data-sub-preview], [data-sub-download]");
    if (action) {
      dispatchAction(action);
      return;
    }
    const row = target.closest<HTMLElement>(".history-row__main");
    const job = findJob(row?.closest<HTMLElement>("[data-job-id]")?.dataset.jobId);
    if (job) activateRow(job);
  }, { signal });

  list.addEventListener("keydown", (event) => {
    const target = event.target as HTMLElement;
    const renameInput = target.closest<HTMLInputElement>("[data-rename-input]");
    if (renameInput) {
      event.stopPropagation();
      if (event.key === "Enter") renameInput.blur();
      else if (event.key === "Escape") {
        renamingId = null;
        void render();
      }
      return;
    }
    if (event.key !== "Enter" && event.key !== " ") return;
    if (!target.matches(".history-row__main")) return;
    event.preventDefault();
    const job = findJob(target.closest<HTMLElement>("[data-job-id]")?.dataset.jobId);
    if (job) activateRow(job);
  }, { signal });

  list.addEventListener("focusout", (event) => {
    const input = (event.target as HTMLElement).closest<HTMLInputElement>("[data-rename-input]");
    const job = findJob(input?.dataset.renameInput);
    if (input && job && renamingId === job.id) void commitRename(job, input);
  }, { signal });

  function syncSearch(): void {
    searchClear.hidden = searchInput.value.length === 0;
    void render();
  }

  searchInput.addEventListener("input", syncSearch, { signal });
  searchClear.addEventListener("click", () => {
    searchInput.value = "";
    syncSearch();
    searchInput.focus();
  }, { signal });

  toolbar = mountHistoryToolbar(query, render, signal);
  subscribeDeletionSettled(() => void render(), signal);

  signal.addEventListener("abort", () => {
    stopCountdownTicker();
  }, { once: true });

  void render();
}
