import { labelAttrs } from "../../utils/labelAttrs";
import { hasTextSelection } from "../../utils/textSelection";
import { getLocale, t, th, markup } from "../../i18n";
import { collectSourcesFromFiles, collectSourcesFromDataTransfer, CollectResult } from "../../lib/subtitle/archive";
import { escapeHtml } from "../../utils/escapeHtml";
import { CHEVRON_DOWN_SMALL_ICON, CLOSE_ICON, UNDO_ICON, renderWarningIcon } from "../../render/icons";
import { mountConfirmButton, ConfirmButtonHandle, UNDO_WINDOW_MS } from "../../components/confirmButton";
import { defaultOutputFormatFor, SubtitleFile, WorkspaceState } from "./state";
import { inputProblem, fileProblem, hasQueuedInput, hasUsableFiles } from "./fileValidation";
import { MAX_SUBTITLES_PER_JOB } from "../../lib/history/historyQuota";
import { showToastMessage } from "../../components/updateToast";
import { createFileFromSource } from "./sourceFile";
import { openVariantChoiceModal } from "../../components/variantChoice";
import { needsChoice, rowKeyOf } from "../../lib/subtitle/variants/selection";
import { sourceFromVariant, variantOfChoice } from "../../lib/subtitle/variants/variantSource";
import { languageName } from "../../utils/languageNames";
import { mountScanRows } from "./scanRows";
import { IntakeContext, resolveVariantSources } from "./variantIntake";
import { variantLanguageOrder } from "./variantLanguageOrder";
import { DuplicateNotice, partitionDuplicates } from "./duplicateSources";
import type { AssistSnapshot } from "./assistFields";
import type { WorkspaceContext } from "./context";

interface ClearedSnapshot {
  files: WorkspaceState["files"];
  rejectedInputs: WorkspaceState["rejectedInputs"];
  currentHistoryId: string | null;
  assist: AssistSnapshot;
}

export interface FileQueueHandle {
  render(): void;
  reset(): void;
}

function renderChipName(label: string, redundantTitle: boolean, repickFileId: string | undefined): string {
  const name = `<bdi class="file-chip__name"${redundantTitle ? " data-truncatable" : ""}>${escapeHtml(label)}</bdi>`;
  if (!repickFileId) return name;
  return `<button type="button" class="file-chip__action" data-repick-file="${repickFileId}" ${labelAttrs(t("tip.changeLanguage", { name: label }))}>${name}${CHEVRON_DOWN_SMALL_ICON}</button>`;
}

function renderChip(label: string, title: string, removeAttribute: string, hasError: boolean, repickFileId?: string): string {
  const redundantTitle = title === label;
  return `
        <span class="file-chip${hasError ? " file-chip--error" : ""}"${redundantTitle ? "" : ` title="${escapeHtml(title)}"`}>
          ${renderChipName(label, redundantTitle, repickFileId)}
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

function chipLabelOf(file: SubtitleFile): string {
  const language = file.choice ? variantOfChoice(file.choice)?.language : null;
  return language ? t("upload.fileWithLanguage", { name: file.relativePath, language: languageName(language, getLocale()) }) : file.relativePath;
}

const canRepickLanguage = (file: SubtitleFile): boolean => file.choice !== undefined && needsChoice(file.choice.group) && file.jobResult === null;

function renderQueue(state: WorkspaceState, duplicates: DuplicateNotice[]): string {
  const errors: string[] = [];
  const fileChips = state.files.map((file) => {
    const message = fileProblem(file);
    if (!message) return renderChip(chipLabelOf(file), file.relativePath, `data-remove-file="${file.id}"`, false, canRepickLanguage(file) ? file.id : undefined);
    errors.push(message);
    return renderChip(file.relativePath, message, `data-remove-file="${file.id}"`, true);
  });
  const inputChips = state.rejectedInputs.map((input, index) => {
    const message = inputProblem(input);
    errors.push(message);
    return renderChip(input.name, message, `data-remove-input="${index}"`, true);
  });
  const duplicateMessages = duplicates.map(({ skipped, keptAs }) => th("upload.duplicateSkipped", { skipped: markup(renderFileName(skipped)), kept: markup(renderFileName(keptAs)) }));
  return fileChips.join("") + inputChips.join("") + renderBanner("error", "alert", errors.map(escapeHtml)) + renderBanner("warning", "status", duplicateMessages);
}

export function mountFileQueue(ctx: WorkspaceContext): FileQueueHandle {
  const { state, signal } = ctx;
  const dropzone = ctx.query<HTMLElement>("#dropzone");
  const queue = ctx.query<HTMLElement>("#dropzone-file");
  const scanHost = ctx.query<HTMLElement>("#dropzone-scans");
  const cancelButton = ctx.query<HTMLButtonElement>("#cancel-upload");
  const fileInput = ctx.query<HTMLInputElement>("#subtitle-file");
  const introSections = ctx.root.querySelectorAll<HTMLElement>("[data-intro]");
  const settingsStep = ctx.query<HTMLElement>("#lang-step");
  const actionConsole = ctx.query<HTMLElement>("#action-console");

  let clearControl: ConfirmButtonHandle | null = null;
  let clearedSnapshot: ClearedSnapshot | null = null;
  let duplicateNotices: DuplicateNotice[] = [];
  let pendingIntake: Promise<void> = Promise.resolve();

  const intakeContext: IntakeContext = {
    scanRows: mountScanRows(scanHost, signal),
    lifecycle: signal,
    languageOrder: () => variantLanguageOrder(state),
    chooseVariants: (groups) => openVariantChoiceModal({ groups, languageOrder: variantLanguageOrder(state) }),
  };

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
      rejectedInputs: state.rejectedInputs,
      currentHistoryId: state.currentHistoryId,
      assist: ctx.assist.capture(),
    };
  }

  async function restoreWorkspace(): Promise<void> {
    if (!clearedSnapshot) return;
    const { files, rejectedInputs, currentHistoryId, assist } = clearedSnapshot;
    clearedSnapshot = null;
    Object.assign(state, { files, rejectedInputs, currentHistoryId });
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
    state.rejectedInputs = [];
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

  async function ingest(rawCollected: CollectResult): Promise<void> {
    const collected = await resolveVariantSources(rawCollected, intakeContext);
    if (!collected.sources.length && !collected.rejectedInputs.length) return;
    const queued = state.files.map((file) => ({ relativePath: file.relativePath, bytes: file.rawSourceBytes ?? new TextEncoder().encode(file.rawSourceText ?? "") }));
    const { unique, notices } = await partitionDuplicates(collected.sources, queued);
    duplicateNotices = notices;
    const result: CollectResult = { sources: unique, rejectedInputs: collected.rejectedInputs, matroskaFiles: [] };
    if (!result.sources.length && !result.rejectedInputs.length) {
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
    state.rejectedInputs.push(...result.rejectedInputs);
    if (wasEmpty && state.files.length) state.outputFormat = defaultOutputFormatFor(state.files);

    render();
    await ctx.flow.filesAdded();
  }

  function enqueueIngest(collecting: Promise<CollectResult>): void {
    pendingIntake = pendingIntake.then(async () => ingest(await collecting)).catch(() => undefined);
  }

  async function repickLanguage(fileId: string): Promise<void> {
    const file = state.files.find(({ id }) => id === fileId);
    const current = file?.choice && variantOfChoice(file.choice);
    if (!file?.choice || !current) return;
    const { group, variantId } = file.choice;
    const chosen = await openVariantChoiceModal({ groups: [group], languageOrder: variantLanguageOrder(state), initialKeys: new Map([[group.id, rowKeyOf(current)]]) });
    const next = group.variants.find(({ id }) => id === chosen?.get(group.id));
    if (!next || next.id === variantId || !state.files.some(({ id }) => id === fileId)) return;
    const replacement = createFileFromSource(state, sourceFromVariant(group, next));
    replacement.id = fileId;
    state.files = state.files.map((candidate) => (candidate.id === fileId ? replacement : candidate));
    state.currentHistoryId = null;
    ctx.log.clear();
    render();
    await ctx.flow.filesAdded();
  }

  queue.addEventListener("click", (event) => {
    const repickId = (event.target as HTMLElement).closest<HTMLElement>("[data-repick-file]")?.dataset.repickFile;
    if (repickId) {
      void repickLanguage(repickId);
      return;
    }
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-remove-file], [data-remove-input]");
    if (!button) return;
    clearedSnapshot ??= snapshotWorkspace();
    if (button.dataset.removeFile) {
      state.files = state.files.filter((file) => file.id !== button.dataset.removeFile);
    } else {
      const removedIndex = Number(button.dataset.removeInput);
      state.rejectedInputs = state.rejectedInputs.filter((_, index) => index !== removedIndex);
    }
    clearControl?.resumePending(UNDO_WINDOW_MS);
    refreshAfterRemoval();
  }, { signal });

  fileInput.addEventListener("change", () => {
    const selected = Array.from(fileInput.files ?? []);
    fileInput.value = "";
    if (selected.length) enqueueIngest(collectSourcesFromFiles(selected));
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
  dropzone.addEventListener("drop", (event) => {
    if (event.dataTransfer) enqueueIngest(collectSourcesFromDataTransfer(event.dataTransfer));
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
