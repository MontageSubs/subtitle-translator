import { labelAttrs } from "../../utils/labelAttrs";
import { hasTextSelection } from "../../utils/textSelection";
import { t } from "../../i18n";
import { collectSourcesFromFiles, collectSourcesFromDataTransfer, CollectResult } from "../../lib/subtitle/archive";
import { escapeHtml } from "../../utils/escapeHtml";
import { CLOSE_ICON, UNDO_ICON, renderWarningIcon } from "../../render/icons";
import { mountConfirmButton, ConfirmButtonHandle, UNDO_WINDOW_MS } from "../../components/confirmButton";
import { defaultOutputFormatFor, WorkspaceState } from "./state";
import { archiveProblem, fileProblem, hasQueuedInput, hasUsableFiles } from "./fileValidation";
import { MAX_SUBTITLES_PER_JOB } from "../../lib/history/historyQuota";
import { showToastMessage } from "../../components/updateToast";
import { createFileFromSource } from "./sourceFile";
import { DuplicateNotice, partitionDuplicates } from "./duplicateSources";
import type { AssistSnapshot } from "./assistFields";
import type { WorkspaceContext } from "./context";

interface ClearedSnapshot {
  files: WorkspaceState["files"];
  rejectedArchives: WorkspaceState["rejectedArchives"];
  currentHistoryId: string | null;
  assist: AssistSnapshot;
}

export interface FileQueueHandle {
  render(): void;
  reset(): void;
}

function renderChip(label: string, title: string, removeAttribute: string, hasError: boolean): string {
  const redundantTitle = title === label;
  return `
        <span class="file-chip${hasError ? " file-chip--error" : ""}"${redundantTitle ? "" : ` title="${escapeHtml(title)}"`}>
          <bdi class="file-chip__name"${redundantTitle ? " data-truncatable" : ""}>${escapeHtml(label)}</bdi>
          <button type="button" class="file-chip__remove" ${removeAttribute} ${labelAttrs(t("tip.removeFile", { name: label }))}>${CLOSE_ICON}</button>
        </span>`;
}

function renderFileName(path: string): string {
  return `<bdi class="file-queue-banner__name" data-truncatable>${escapeHtml(path)}</bdi>`;
}

function renderBanner(variant: "error" | "warning", role: "alert" | "status", messages: string[]): string {
  if (!messages.length) return "";
  return `
        <div class="file-queue-banner file-queue-banner--${variant}" role="${role}">${messages.map((message) => `<div class="file-queue-banner__item">${renderWarningIcon(14)}<span>${message}</span></div>`).join("")}
        </div>`;
}

function renderQueue(state: WorkspaceState, duplicates: DuplicateNotice[]): string {
  const errors: string[] = [];
  const fileChips = state.files.map((file) => {
    const message = fileProblem(file);
    if (!message) return renderChip(file.relativePath, file.relativePath, `data-remove-file="${file.id}"`, false);
    errors.push(message);
    return renderChip(file.relativePath, message, `data-remove-file="${file.id}"`, true);
  });
  const archiveChips = state.rejectedArchives.map((archive, index) => {
    const message = archiveProblem(archive);
    errors.push(message);
    return renderChip(archive.name, message, `data-remove-archive="${index}"`, true);
  });
  const duplicateMessages = duplicates.map(({ skipped, keptAs }) => t("upload.duplicateSkipped", { skipped: renderFileName(skipped), kept: renderFileName(keptAs) }));
  return fileChips.join("") + archiveChips.join("") + renderBanner("error", "alert", errors.map(escapeHtml)) + renderBanner("warning", "status", duplicateMessages);
}

export function mountFileQueue(ctx: WorkspaceContext): FileQueueHandle {
  const { state, signal } = ctx;
  const dropzone = ctx.query<HTMLElement>("#dropzone");
  const queue = ctx.query<HTMLElement>("#dropzone-file");
  const cancelButton = ctx.query<HTMLButtonElement>("#cancel-upload");
  const fileInput = ctx.query<HTMLInputElement>("#subtitle-file");
  const introSections = ctx.root.querySelectorAll<HTMLElement>("[data-intro]");
  const settingsStep = ctx.query<HTMLElement>("#lang-step");
  const actionConsole = ctx.query<HTMLElement>("#action-console");

  let clearControl: ConfirmButtonHandle | null = null;
  let clearedSnapshot: ClearedSnapshot | null = null;
  let duplicateNotices: DuplicateNotice[] = [];

  function render(): void {
    queue.innerHTML = renderQueue(state, duplicateNotices);
    const visible = hasUsableFiles(state);
    cancelButton.disabled = !hasQueuedInput(state) && !clearControl?.isPending();
    introSections.forEach((section) => { section.hidden = visible; });
    settingsStep.hidden = !visible;
    actionConsole.hidden = !visible;
  }

  function snapshotWorkspace(): ClearedSnapshot {
    return {
      files: state.files,
      rejectedArchives: state.rejectedArchives,
      currentHistoryId: state.currentHistoryId,
      assist: ctx.assist.capture(),
    };
  }

  async function restoreWorkspace(): Promise<void> {
    if (!clearedSnapshot) return;
    const { files, rejectedArchives, currentHistoryId, assist } = clearedSnapshot;
    clearedSnapshot = null;
    Object.assign(state, { files, rejectedArchives, currentHistoryId });
    ctx.assist.restore(assist);
    render();
    await ctx.flow.filesAdded();
  }

  function clearWorkspace(): void {
    clearedSnapshot = snapshotWorkspace();
    reset();
  }

  function reset(): void {
    state.files = [];
    state.rejectedArchives = [];
    state.currentHistoryId = null;
    duplicateNotices = [];
    fileInput.value = "";
    render();
    ctx.flow.workspaceCleared();
  }

  function refreshAfterRemoval(): void {
    duplicateNotices = [];
    if (!hasQueuedInput(state)) {
      reset();
      return;
    }
    render();
    ctx.flow.filesRemoved();
  }

  async function ingest(collected: CollectResult): Promise<void> {
    if (!collected.sources.length && !collected.rejectedArchives.length) return;
    const queued = state.files.map((file) => ({ relativePath: file.relativePath, bytes: file.rawSourceBytes ?? new TextEncoder().encode(file.rawSourceText ?? "") }));
    const { unique, notices } = await partitionDuplicates(collected.sources, queued);
    duplicateNotices = notices;
    const result: CollectResult = { sources: unique, rejectedArchives: collected.rejectedArchives };
    if (!result.sources.length && !result.rejectedArchives.length) {
      render();
      return;
    }
    clearControl?.settle();
    clearedSnapshot = null;
    const wasEmpty = state.files.length === 0;
    const accepted = result.sources.slice(0, Math.max(0, MAX_SUBTITLES_PER_JOB - state.files.length));
    if (accepted.length < result.sources.length) showToastMessage(t("error.tooManySubtitles", { max: MAX_SUBTITLES_PER_JOB }), 6000);
    ctx.log.clear();
    state.currentHistoryId = null;
    state.files.push(...accepted.map((source) => createFileFromSource(state, source)));
    state.rejectedArchives.push(...result.rejectedArchives);
    if (wasEmpty && state.files.length) state.outputFormat = defaultOutputFormatFor(state.files);

    render();
    await ctx.flow.filesAdded();
  }

  queue.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-remove-file], [data-remove-archive]");
    if (!button) return;
    clearedSnapshot ??= snapshotWorkspace();
    if (button.dataset.removeFile) {
      state.files = state.files.filter((file) => file.id !== button.dataset.removeFile);
    } else {
      const removedIndex = Number(button.dataset.removeArchive);
      state.rejectedArchives = state.rejectedArchives.filter((_, index) => index !== removedIndex);
    }
    clearControl?.resumePending(UNDO_WINDOW_MS);
    refreshAfterRemoval();
  }, { signal });

  fileInput.addEventListener("change", async () => {
    const selected = Array.from(fileInput.files ?? []);
    if (selected.length) await ingest(await collectSourcesFromFiles(selected));
    fileInput.value = "";
  }, { signal });

  dropzone.addEventListener("click", (event) => {
    if (hasTextSelection() && (event.target as HTMLElement).closest(".dropzone__prompt")) event.preventDefault();
  }, { signal });

  (["dragover", "dragenter"] as const).forEach((type) => dropzone.addEventListener(type, (event) => {
    event.preventDefault();
    dropzone.classList.add("dropzone--active");
  }, { signal }));
  (["dragleave", "drop"] as const).forEach((type) => dropzone.addEventListener(type, (event) => {
    event.preventDefault();
    dropzone.classList.remove("dropzone--active");
  }, { signal }));
  dropzone.addEventListener("drop", async (event) => {
    if (event.dataTransfer) await ingest(await collectSourcesFromDataTransfer(event.dataTransfer));
  }, { signal });

  clearControl = mountConfirmButton({
    button: cancelButton,
    label: ctx.query<HTMLElement>("#cancel-upload-label"),
    idleText: () => t("upload.clear"),
    confirmText: () => t("upload.clearConfirm"),
    icons: { idle: CLOSE_ICON, undo: UNDO_ICON },
    onArm: () => ctx.announce(t("upload.clearConfirm")),
    onConfirm: clearWorkspace,
    undo: {
      text: (seconds) => t("common.undoCountdown", { seconds }),
      applyImmediately: true,
      onCancel: () => void restoreWorkspace(),
      onExpire: () => {
        clearedSnapshot = null;
        render();
      },
    },
    signal,
  });

  return { render, reset };
}
