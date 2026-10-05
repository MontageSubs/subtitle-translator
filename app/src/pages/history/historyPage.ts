import { scopedQuery } from "../../utils/dom";
import { getLocale, t } from "../../i18n";
import { HistoryJob, clearHistory, deleteHistoryJob, getHistoryId, importHistoryJson, listHistoryJobs, updateHistoryJob } from "../../lib/history/history";
import { requestHistoryRestore } from "../../lib/history/historyRestore";
import { setPageMeta } from "../../config/head";
import { buildPath, navigate } from "../../router/router";
import { mountConfirmButton } from "../../components/confirmButton";
import { showToastMessage } from "../../components/updateToast";
import { offlineSearchMatch } from "../../utils/offlineSearch";
import { downloadHistoryBackup, downloadJob, downloadSubtitle } from "./exports";
import { renderJobRow } from "./jobRow";
import { renderHistoryPage } from "./pageMarkup";
import { openSubtitlePreview } from "./previewBridge";

const DELETE_CONFIRM_TIMEOUT_MS = 4000;

function searchableContent(job: HistoryJob): string {
  return job.subtitles.flatMap((subtitle) => subtitle.cues.flatMap((cue) => [cue.sourceText, cue.translatedText])).join("\n");
}

function restoreJob(job: HistoryJob): void {
  requestHistoryRestore(job);
  navigate(buildPath(getLocale(), "nmt"));
}

export function mount(container: HTMLElement, signal: AbortSignal): void {
  setPageMeta(t("nav.history"), t("meta.history.description"));
  container.innerHTML = renderHistoryPage();

  const query = scopedQuery(container);
  const list = query<HTMLElement>("#history-list");
  const matchCount = query<HTMLElement>("#history-match-count");
  const searchInput = query<HTMLInputElement>("#history-search-input");
  const searchClear = query<HTMLButtonElement>("#history-search-clear");
  const importInput = query<HTMLInputElement>("#history-import-input");

  const expandedIds = new Set<string>();
  const confirmingDeleteIds = new Set<string>();
  const deleteTimers = new Map<string, number>();
  let renamingId: string | null = null;
  let visibleJobs: HistoryJob[] = [];

  const findJob = (id: string | undefined) => visibleJobs.find((job) => job.id === id);

  function disarmDelete(jobId: string): void {
    confirmingDeleteIds.delete(jobId);
    window.clearTimeout(deleteTimers.get(jobId));
    deleteTimers.delete(jobId);
  }

  function armDelete(jobId: string): void {
    confirmingDeleteIds.add(jobId);
    deleteTimers.set(jobId, window.setTimeout(() => {
      disarmDelete(jobId);
      void render();
    }, DELETE_CONFIRM_TIMEOUT_MS));
  }

  function showMessage(messageKey: "history.empty" | "history.noResults"): void {
    list.innerHTML = `<p class="muted history-empty">${t(messageKey)}</p>`;
  }

  async function render(): Promise<void> {
    const currentHistoryId = getHistoryId();
    const allJobs = await listHistoryJobs();
    const trimmed = searchInput.value.trim();
    if (!allJobs.length) {
      matchCount.textContent = "";
      visibleJobs = [];
      showMessage("history.empty");
      return;
    }

    visibleJobs = trimmed ? allJobs.filter((job) => offlineSearchMatch(searchInput.value, job.title, searchableContent(job))) : allJobs;
    matchCount.textContent = trimmed ? t("history.matchCount", { count: visibleJobs.length }) : "";
    if (!visibleJobs.length) {
      showMessage("history.noResults");
      return;
    }

    list.innerHTML = visibleJobs.map((job) => renderJobRow(job, {
      expanded: expandedIds.has(job.id),
      renaming: renamingId === job.id,
      confirmingDelete: confirmingDeleteIds.has(job.id),
      imported: Boolean(job.historyId && job.historyId !== currentHistoryId),
    })).join("");
    const renameInput = list.querySelector<HTMLInputElement>("[data-rename-input]");
    renameInput?.focus();
    renameInput?.select();
  }

  async function commitRename(job: HistoryJob, input: HTMLInputElement): Promise<void> {
    const title = input.value.trim() || job.translatedFilename || job.sourceFilename || job.title;
    renamingId = null;
    if (title !== job.title) await updateHistoryJob(job.id, { title });
    await render();
  }

  function activateRow(job: HistoryJob): void {
    if (job.subtitles.length === 1) {
      void openSubtitlePreview(job.id, job.subtitles[0].id);
      return;
    }
    if (!expandedIds.delete(job.id)) expandedIds.add(job.id);
    void render();
  }

  async function confirmDelete(jobId: string): Promise<void> {
    if (!confirmingDeleteIds.has(jobId)) {
      armDelete(jobId);
    } else {
      disarmDelete(jobId);
      await deleteHistoryJob(jobId);
    }
    await render();
  }

  function dispatchAction(button: HTMLElement): void {
    const { dataset } = button;
    const rowJob = findJob(button.closest<HTMLElement>("[data-job-id]")?.dataset.jobId);
    if (dataset.rename) {
      renamingId = dataset.rename;
      void render();
    } else if (dataset.restore) {
      const job = findJob(dataset.restore);
      if (job) restoreJob(job);
    } else if (dataset.download) {
      const job = findJob(dataset.download);
      if (job) void downloadJob(job);
    } else if (dataset.delete) {
      void confirmDelete(dataset.delete);
    } else if (dataset.subPreview && rowJob) {
      void openSubtitlePreview(rowJob.id, dataset.subPreview);
    } else if (dataset.subDownload && rowJob) {
      const subtitle = rowJob.subtitles.find((candidate) => candidate.id === dataset.subDownload);
      if (subtitle) downloadSubtitle(rowJob, subtitle);
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

  query("#history-export-btn").addEventListener("click", () => { void downloadHistoryBackup(); }, { signal });
  query("#history-import-btn").addEventListener("click", () => {
    importInput.value = "";
    importInput.click();
  }, { signal });
  importInput.addEventListener("change", async () => {
    const file = importInput.files?.[0];
    if (!file) return;
    try {
      const result = await importHistoryJson(await file.text());
      if (!result || (result.imported === 0 && result.updated === 0)) showToastMessage(t("error.invalidHistoryBackup"));
      else await render();
    } catch {
      showToastMessage(t("error.invalidHistoryBackup"));
    }
  }, { signal });

  mountConfirmButton({
    button: query<HTMLButtonElement>("#history-clear"),
    label: query<HTMLElement>("#history-clear-label"),
    idleText: () => t("history.clearAll"),
    confirmText: () => t("history.confirmClear"),
    onConfirm: () => { void clearHistory().then(render); },
    signal,
  });

  signal.addEventListener("abort", () => deleteTimers.forEach((timer) => window.clearTimeout(timer)), { once: true });

  void render();
}
