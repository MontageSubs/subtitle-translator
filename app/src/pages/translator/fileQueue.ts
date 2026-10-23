import { labelAttrs } from "../../utils/labelAttrs";
import { t } from "../../i18n";
import { collectSourcesFromFiles, collectSourcesFromDataTransfer, CollectResult } from "../../lib/subtitle/archive";
import { escapeHtml } from "../../utils/escapeHtml";
import { CLOSE_ICON, renderWarningIcon } from "../../render/icons";
import { mountConfirmButton } from "../../components/confirmButton";
import { defaultOutputFormatFor, WorkspaceState } from "./state";
import { archiveProblem, fileProblem, hasQueuedInput, hasUsableFiles } from "./fileValidation";
import { MAX_SUBTITLES_PER_JOB } from "../../lib/history/historyQuota";
import { showToastMessage } from "../../components/updateToast";
import { createFileFromSource } from "./sourceFile";
import type { WorkspaceContext } from "./context";

export interface FileQueueHandle {
  render(): void;
  reset(): void;
}

function renderChip(label: string, title: string, removeAttribute: string, hasError: boolean): string {
  return `
        <span class="file-chip${hasError ? " file-chip--error" : ""}" title="${escapeHtml(title)}">
          <bdi class="file-chip__name">${escapeHtml(label)}</bdi>
          <button type="button" class="file-chip__remove" ${removeAttribute} ${labelAttrs(t("tip.removeFile", { name: label }))}>${CLOSE_ICON}</button>
        </span>`;
}

function renderQueue(state: WorkspaceState): string {
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
  const banner = errors.length
    ? `
        <div class="file-queue-error-banner" role="alert">${errors.map((message) => `<div class="file-queue-error-banner__item">${renderWarningIcon(14)}<span>${escapeHtml(message)}</span></div>`).join("")}
        </div>`
    : "";
  return fileChips.join("") + archiveChips.join("") + banner;
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

  function render(): void {
    queue.innerHTML = renderQueue(state);
    const visible = hasUsableFiles(state);
    cancelButton.disabled = !hasQueuedInput(state);
    introSections.forEach((section) => { section.hidden = visible; });
    settingsStep.hidden = !visible;
    actionConsole.hidden = !visible;
  }

  function reset(): void {
    state.files = [];
    state.rejectedArchives = [];
    state.currentHistoryId = null;
    fileInput.value = "";
    render();
    ctx.flow.workspaceCleared();
  }

  function refreshAfterRemoval(): void {
    if (!hasQueuedInput(state)) {
      reset();
      return;
    }
    render();
    ctx.flow.filesRemoved();
  }

  async function ingest(result: CollectResult): Promise<void> {
    if (!result.sources.length && !result.rejectedArchives.length) return;
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
    if (button.dataset.removeFile) {
      state.files = state.files.filter((file) => file.id !== button.dataset.removeFile);
    } else {
      state.rejectedArchives.splice(Number(button.dataset.removeArchive), 1);
    }
    refreshAfterRemoval();
  }, { signal });

  fileInput.addEventListener("change", async () => {
    const selected = Array.from(fileInput.files ?? []);
    if (selected.length) await ingest(await collectSourcesFromFiles(selected));
    fileInput.value = "";
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

  mountConfirmButton({
    button: cancelButton,
    label: ctx.query<HTMLElement>("#cancel-upload-label"),
    idleText: () => t("upload.clear"),
    confirmText: () => t("upload.clearConfirm"),
    onArm: () => ctx.announce(t("upload.clearConfirm")),
    onConfirm: reset,
    undo: { text: () => t("common.undo") },
    signal,
  });

  return { render, reset };
}
