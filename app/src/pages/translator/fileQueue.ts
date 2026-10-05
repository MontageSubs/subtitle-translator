import { t } from "../../i18n";
import { parseSubtitle, isValidSubtitleContent } from "../../lib/subtitle/formats/registry";
import { detectFormat } from "../../lib/subtitle/formats/extensions";
import { collectSourcesFromFiles, collectSourcesFromDataTransfer, CollectResult, RawSource } from "../../lib/subtitle/archive";
import { decodeSubtitleBytes } from "../../lib/subtitle/extraction/encoding";
import { escapeHtml } from "../../utils/escapeHtml";
import { CLOSE_ICON } from "../../render/icons";
import { setTranslationCompletedNotDownloaded, setContextOrGlossaryEdited } from "../../lib/unsavedChanges";
import { createSubtitleFile, defaultOutputFormatFor, ParseErrorReason, SubtitleFile, WorkspaceState } from "./state";
import type { WorkspaceContext } from "./context";

export interface FileQueueHandle {
  render(): void;
  setWorkspaceVisible(visible: boolean): void;
  reset(): void;
}

function parseErrorMessage(file: SubtitleFile): string {
  switch (file.parseErrorReason) {
    case "invalidFormat": return t("error.invalidSubtitleFormat", { name: file.filename });
    case "noCues": return t("error.noDialogueLines", { name: file.filename });
    default: return t("error.unreadableFile", { name: file.filename });
  }
}

function renderChip(label: string, title: string, removeAttribute: string, hasError: boolean): string {
  return `
        <span class="file-chip${hasError ? " file-chip--error" : ""}" title="${escapeHtml(title)}">
          <span class="file-chip__name">${escapeHtml(label)}</span>
          <button type="button" class="file-chip__remove" ${removeAttribute} aria-label="${t("glossary.remove")}">${CLOSE_ICON}</button>
        </span>`;
}

function renderQueue(state: WorkspaceState): string {
  const errors: string[] = [];
  const fileChips = state.files.map((file) => {
    if (!file.parseError) return renderChip(file.relativePath, file.relativePath, `data-remove-file="${file.id}"`, false);
    const message = parseErrorMessage(file);
    errors.push(message);
    return renderChip(file.relativePath, message, `data-remove-file="${file.id}"`, true);
  });
  const archiveChips = state.rejectedArchives.map((name, index) => {
    const message = t("error.unsupportedArchive", { name });
    errors.push(message);
    return renderChip(name, message, `data-remove-archive="${index}"`, true);
  });
  const banner = errors.length
    ? `
        <div class="file-queue-error-banner" role="alert">${errors.map((message) => `<div>⚠️ ${escapeHtml(message)}</div>`).join("")}
        </div>`
    : "";
  return fileChips.join("") + archiveChips.join("") + banner;
}

function createFileFromSource(state: WorkspaceState, source: RawSource): SubtitleFile {
  const { text, format: sourceFormat } = decodeSubtitleBytes(source.bytes);
  const originFormat = detectFormat(source.name);
  const isValid = isValidSubtitleContent(text, originFormat);
  const cues = isValid ? parseSubtitle(originFormat, text) : [];
  const parseErrorReason: ParseErrorReason | null = !isValid ? "invalidFormat" : cues.length === 0 ? "noCues" : null;
  return createSubtitleFile(state, {
    filename: source.name,
    relativePath: source.relativePath,
    sourceFormat,
    originFormat,
    rawSourceText: text,
    rawSourceBytes: source.bytes,
    cues,
    parseError: parseErrorReason !== null,
    parseErrorReason,
  });
}

export function mountFileQueue(ctx: WorkspaceContext): FileQueueHandle {
  const { state, signal } = ctx;
  const dropzone = ctx.query<HTMLElement>("#dropzone");
  const queue = ctx.query<HTMLElement>("#dropzone-file");
  const cancelButton = ctx.query<HTMLButtonElement>("#cancel-upload");
  const fileInput = ctx.query<HTMLInputElement>("#subtitle-file");
  const introFeatures = ctx.query<HTMLElement>("#intro-features");
  const settingsStep = ctx.query<HTMLElement>("#lang-step");
  const actionConsole = ctx.query<HTMLElement>("#action-console");

  function render(): void {
    queue.innerHTML = renderQueue(state);
  }

  function setWorkspaceVisible(visible: boolean): void {
    cancelButton.hidden = !visible;
    introFeatures.hidden = visible;
    settingsStep.hidden = !visible;
    actionConsole.hidden = !visible;
  }

  function reset(): void {
    ctx.progress.stop();
    state.files = [];
    state.rejectedArchives = [];
    state.currentHistoryId = null;
    state.glossaryEntries = [];
    setTranslationCompletedNotDownloaded(false);
    setContextOrGlossaryEdited(false);
    ctx.assist.context.setText("");
    ctx.assist.glossary.setEntries([]);
    fileInput.value = "";
    render();
    setWorkspaceVisible(false);
    ctx.task.setState("ready");
    ctx.log.clear();
  }

  function resetIfEmpty(): boolean {
    if (state.files.length || state.rejectedArchives.length) return false;
    reset();
    return true;
  }

  function refreshAfterRemoval(): void {
    if (resetIfEmpty()) return;
    render();
    ctx.assist.scene.updatePreview();
    ctx.task.updateHeader();
  }

  async function ingest(result: CollectResult): Promise<void> {
    if (!result.sources.length && !result.rejectedArchives.length) return;
    const wasEmpty = state.files.length === 0;
    ctx.log.clear();
    state.currentHistoryId = null;
    state.files.push(...result.sources.map((source) => createFileFromSource(state, source)));
    state.rejectedArchives.push(...result.rejectedArchives);
    if (wasEmpty && state.files.length) state.outputFormat = defaultOutputFormatFor(state.files);

    render();
    setWorkspaceVisible(true);
    ctx.task.setState("ready");
    ctx.assist.scene.updatePreview();
    ctx.task.updateHeader();
    if (state.files.length && !state.userPickedSourceLang) await ctx.language.runLocalDetection();
  }

  queue.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-remove-file], [data-remove-archive]");
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
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

  cancelButton.addEventListener("click", reset, { signal });

  return { render, setWorkspaceVisible, reset };
}
