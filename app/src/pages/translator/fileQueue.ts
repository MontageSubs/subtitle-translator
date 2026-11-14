import { fileNameInner } from "../../utils/fileNameMarkup";
import { labelAttrs } from "../../utils/labelAttrs";
import { hasTextSelection } from "../../utils/textSelection";
import { Markup, getLocale, markup, t, th } from "../../i18n";
import { collectSourcesFromFiles, collectSourcesFromDataTransfer, CollectResult } from "../../lib/subtitle/archive";
import { escapeHtml } from "../../utils/escapeHtml";
import { CHEVRON_DOWN_SMALL_ICON, CLOSE_ICON, REFRESH_ICON, UNDO_ICON, renderWarningIcon } from "../../render/icons";
import { mountConfirmButton, ConfirmButtonHandle, UNDO_WINDOW_MS } from "../../components/confirmButton";
import { defaultOutputFormatFor, SubtitleFile, WorkspaceState } from "./state";
import { inputProblem, fileProblem, hasQueuedInput, hasUsableFiles } from "./fileValidation";
import { MAX_SUBTITLES_PER_JOB } from "../../lib/history/historyQuota";
import { showToast, TOAST_PRIORITY } from "../../components/toast";
import { createFileFromSource } from "./sourceFile";
import { openVariantChoiceModal } from "../../components/variantChoice";
import { keyOfVariant, needsChoice, resolveKey } from "../../lib/subtitle/variants/selection";
import type { SourceChoice, SubtitleVariant, VariantGroup } from "../../lib/subtitle/variants/types";
import { sourceFromVariant, variantOfChoice } from "../../lib/subtitle/variants/variantSource";
import { languageName } from "../../utils/languageNames";
import { mountScanRows } from "./scanRows";
import { IntakeContext, IntakeResult, resolveVariantSources } from "./variantIntake";
import { variantLanguagePreference } from "./variantLanguagePreference";
import { DuplicateNotice, partitionDuplicates } from "./duplicateSources";
import type { AssistSnapshot } from "./assistFields";
import type { WorkspaceContext } from "./context";

interface ClearedSnapshot {
  files: WorkspaceState["files"];
  rejectedInputs: WorkspaceState["rejectedInputs"];
  currentHistoryId: string | null;
  assist: AssistSnapshot;
  discarded: VariantGroup[];
}

export interface FileQueueHandle {
  render(): void;
  reset(): void;
}

interface ChipLabel {
  name: string;
  full: string;
  before: string;
  after: string;
}

const NAME_SLOT = "\u0001";

const renderAffix = (text: string): string => (text ? `<bdi class="file-chip__affix">${escapeHtml(text)}</bdi>` : "");

function renderChipName({ name, full, before, after }: ChipLabel, repickFileId: string | undefined): string {
  const label = `${renderAffix(before)}<bdi class="file-chip__name" data-truncatable data-filename>${fileNameInner(name)}</bdi>${renderAffix(after)}`;
  if (!repickFileId) return label;
  return `<button type="button" class="file-chip__action" data-repick-file="${repickFileId}" ${labelAttrs(t("tip.changeLanguage", { name: full }))}>${label}${CHEVRON_DOWN_SMALL_ICON}</button>`;
}

const plainLabel = (name: string): ChipLabel => ({ name, full: name, before: "", after: "" });

function renderRetryButton(retryIndex: number | undefined, label: string): string {
  if (retryIndex === undefined) return "";
  return `<button type="button" class="file-chip__action file-chip__retry" data-retry-input="${retryIndex}" ${labelAttrs(t("tip.retryRead", { name: label }))}>${REFRESH_ICON}</button>`;
}

function renderChip(label: ChipLabel, title: string, removeAttribute: string, hasError: boolean, repickFileId?: string, retryIndex?: number): string {
  const redundantTitle = title === label.full;
  return `
        <span class="file-chip${hasError ? " file-chip--error" : ""}"${redundantTitle ? "" : ` title="${escapeHtml(title)}"`}>
          ${renderChipName(label, repickFileId)}
          ${renderRetryButton(retryIndex, label.full)}
          <button type="button" class="file-chip__remove" ${removeAttribute} ${labelAttrs(t("tip.removeFile", { name: label.full }))}>${CLOSE_ICON}</button>
        </span>`;
}

const renderFileName = (path: string): Markup => markup(`<bdi class="file-queue-banner__name" data-truncatable data-filename>${fileNameInner(path)}</bdi>`);

function renderBanner(variant: "error" | "warning", role: "alert" | "status", messages: string[]): string {
  if (!messages.length) return "";
  return `
        <div class="file-queue-banner file-queue-banner--${variant}" role="${role}">${messages.map((message) => `<div class="file-queue-banner__item">${renderWarningIcon(14)}<span>${message}</span></div>`).join("")}
        </div>`;
}

function chipLabelOf(file: SubtitleFile): ChipLabel {
  const variant = file.choice && variantOfChoice(file.choice);
  if (!variant) return plainLabel(file.relativePath);
  const parts = [
    variant.language ? languageName(variant.language, getLocale()) : t("variant.unknownLanguage"),
    variant.isForced ? t("variant.flag.forced") : null,
    variant.isHearingImpaired ? t("variant.flag.sdh") : null,
  ].filter((part): part is string => part !== null);
  if (!variant.language && parts.length <= 1) return plainLabel(file.relativePath);
  const [before, after] = t("upload.fileWithLanguage", { name: NAME_SLOT, language: parts.join(" · ") }).split(NAME_SLOT);
  return { name: file.relativePath, full: t("upload.fileWithLanguage", { name: file.relativePath, language: parts.join(" · ") }), before, after: after ?? "" };
}

const canRepickLanguage = (file: SubtitleFile, unsettled: ReadonlySet<string>): boolean => file.choice !== undefined && !unsettled.has(file.id) && needsChoice(file.choice.group) && file.jobResult === null;

function renderBatchRepick(count: number): string {
  const label = t("variant.changeAll", { count });
  return `<button type="button" class="file-queue-batch" data-repick-all ${labelAttrs(label)}><span>${escapeHtml(label)}</span>${CHEVRON_DOWN_SMALL_ICON}</button>`;
}

function renderQueue(state: WorkspaceState, duplicates: DuplicateNotice[], unsettled: ReadonlySet<string>): string {
  const errors: string[] = [];
  const repickable = state.files.filter((file) => canRepickLanguage(file, unsettled)).length;
  const fileChips = state.files.map((file) => {
    const message = fileProblem(file);
    if (!message) return renderChip(chipLabelOf(file), file.relativePath, `data-remove-file="${file.id}"`, false, canRepickLanguage(file, unsettled) ? file.id : undefined);
    errors.push(message);
    return renderChip(plainLabel(file.relativePath), message, `data-remove-file="${file.id}"`, true);
  });
  const inputChips = state.rejectedInputs.map((input, index) => {
    const message = inputProblem(input);
    errors.push(message);
    return renderChip(plainLabel(input.name), message, `data-remove-input="${index}"`, true, undefined, input.retry ? index : undefined);
  });
  const duplicateMessages = duplicates.map(({ skipped, keptAs }) => th("upload.duplicateSkipped", { skipped: renderFileName(skipped), kept: renderFileName(keptAs) }));
  return (repickable > 1 ? renderBatchRepick(repickable) : "") + fileChips.join("") + inputChips.join("") + renderBanner("error", "alert", errors.map(escapeHtml)) + renderBanner("warning", "status", duplicateMessages);
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
  const unsettledFileIds = new Set<string>();
  let choicesApplied = false;

  const intakeContext: IntakeContext = {
    scanRows: mountScanRows(scanHost, signal),
    lifecycle: signal,
    languagePreference: variantLanguagePreference,
    targetLanguage: () => state.targetLang,
    addProvisional,
    isQueued: (fileId) => state.files.some(({ id }) => id === fileId),
    applyChoice: (fileId, group, variant) => {
      replaceFile(fileId, group, variant);
      choicesApplied = true;
    },
    dropProvisional,
    markUnsettled: (fileId) => unsettledFileIds.add(fileId),
    chooseVariants: (groups) => openVariantChoiceModal({ groups, preference: variantLanguagePreference(), avoidLanguage: state.targetLang }),
  };

  function render(): void {
    queue.innerHTML = renderQueue(state, duplicateNotices, unsettledFileIds);
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
      discarded: [],
    };
  }

  async function restoreWorkspace(): Promise<void> {
    if (!clearedSnapshot) return;
    const { files, rejectedInputs, currentHistoryId, assist, discarded } = clearedSnapshot;
    clearedSnapshot = null;
    Object.assign(state, { files, rejectedInputs, currentHistoryId });
    const preference = variantLanguagePreference();
    state.files = [...files, ...discarded.map((group) => createFileFromSource(state, sourceFromVariant(group, resolveKey(group, undefined, preference, state.targetLang))))];
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

  function stashDiscarded(groups: VariantGroup[]): void {
    clearedSnapshot ??= snapshotWorkspace();
    clearedSnapshot.discarded.push(...groups);
    clearControl?.resumePending(UNDO_WINDOW_MS);
    render();
  }

  const queuedInputs = () => state.files.map((file) => ({ relativePath: file.relativePath, bytes: file.rawSourceBytes ?? new TextEncoder().encode(file.rawSourceText ?? "") }));

  function beginAddition(): boolean {
    if (state.files.length >= MAX_SUBTITLES_PER_JOB) {
      showToast({ key: "too-many-subtitles", message: t("error.tooManySubtitles", { max: MAX_SUBTITLES_PER_JOB }), durationMs: 6000 });
      return false;
    }
    ctx.log.clear();
    state.currentHistoryId = null;
    return true;
  }

  async function addProvisional(group: VariantGroup, variant: SubtitleVariant): Promise<string | null> {
    const { unique, notices } = await partitionDuplicates([sourceFromVariant(group, variant)], queuedInputs());
    duplicateNotices = [...duplicateNotices, ...notices];
    if (!unique.length || !beginAddition()) {
      render();
      return null;
    }
    const wasEmpty = state.files.length === 0;
    const file = createFileFromSource(state, unique[0]);
    state.files.push(file);
    clearedSnapshot?.files.push(file);
    if (wasEmpty) state.outputFormat = defaultOutputFormatFor(state.files);
    render();
    await ctx.flow.filesAdded();
    return file.id;
  }

  function dropProvisional(fileId: string): void {
    const keep = (files: SubtitleFile[]): SubtitleFile[] => files.filter(({ id }) => id !== fileId);
    state.files = keep(state.files);
    if (clearedSnapshot) clearedSnapshot.files = keep(clearedSnapshot.files);
    render();
  }

  function replaceFile(fileId: string, group: VariantGroup, variant: SubtitleVariant): void {
    const replacement = createFileFromSource(state, sourceFromVariant(group, variant));
    replacement.id = fileId;
    const swap = (files: SubtitleFile[]): SubtitleFile[] => files.map((candidate) => (candidate.id === fileId ? replacement : candidate));
    state.files = swap(state.files);
    if (clearedSnapshot) clearedSnapshot.files = swap(clearedSnapshot.files);
  }

  async function ingest(rawCollected: CollectResult): Promise<void> {
    duplicateNotices = [];
    choicesApplied = false;
    state.intakeActive = rawCollected.matroskaFiles.length > 0 || rawCollected.sources.length > 0;
    ctx.task.updateHeader();
    let resolved: IntakeResult;
    try {
      resolved = await resolveVariantSources(rawCollected, intakeContext);
    } finally {
      unsettledFileIds.clear();
      state.intakeActive = false;
    }
    if (choicesApplied) {
      state.currentHistoryId = null;
      ctx.log.clear();
      render();
      await ctx.flow.filesAdded();
    }
    await addCollected(resolved);
    if (resolved.discarded.length) stashDiscarded(resolved.discarded);
    else render();
    ctx.task.updateHeader();
  }

  async function addCollected(collected: Pick<CollectResult, "sources" | "rejectedInputs">): Promise<void> {
    if (!collected.sources.length && !collected.rejectedInputs.length) return;
    const { unique, notices } = await partitionDuplicates(collected.sources, queuedInputs());
    duplicateNotices = [...duplicateNotices, ...notices];
    if (!unique.length && !collected.rejectedInputs.length) {
      render();
      return;
    }
    clearControl?.settle();
    clearedSnapshot = null;
    const wasEmpty = state.files.length === 0;
    const accepted = unique.slice(0, Math.max(0, MAX_SUBTITLES_PER_JOB - state.files.length));
    if (accepted.length < unique.length) showToast({ key: "too-many-subtitles", message: t("error.tooManySubtitles", { max: MAX_SUBTITLES_PER_JOB }), durationMs: 6000 });
    ctx.log.clear();
    state.currentHistoryId = null;
    state.files.push(...accepted.map((source) => createFileFromSource(state, source)));
    state.rejectedInputs.push(...collected.rejectedInputs);
    if (wasEmpty && state.files.length) state.outputFormat = defaultOutputFormatFor(state.files);

    render();
    await ctx.flow.filesAdded();
  }

  function enqueueIngest(collecting: Promise<CollectResult>): void {
    pendingIntake = pendingIntake.then(async () => ingest(await collecting)).catch((error: unknown) => {
      console.error("[subtitle-translator] Adding files failed", error);
      showToast({ key: "import-failed", message: t("error.importFailed"), priority: TOAST_PRIORITY.warning, durationMs: 6000 });
    });
  }

  async function repickLanguages(fileIds: readonly string[]): Promise<void> {
    const targets = fileIds
      .map((fileId) => state.files.find(({ id }) => id === fileId))
      .filter((file): file is SubtitleFile & { choice: SourceChoice } => file?.choice !== undefined && variantOfChoice(file.choice) !== undefined);
    if (!targets.length) return;
    const initialKeys = new Map(targets.map(({ choice }) => [choice.group.id, keyOfVariant(choice.group, variantOfChoice(choice)!)]));
    const chosen = await openVariantChoiceModal({ groups: targets.map(({ choice }) => choice.group), preference: variantLanguagePreference(), avoidLanguage: state.targetLang, initialKeys });
    if (!chosen) return;
    let changed = false;
    for (const { id, choice } of targets) {
      const next = choice.group.variants.find((variant) => variant.id === chosen.get(choice.group.id));
      if (!next || next.id === choice.variantId || !state.files.some((file) => file.id === id)) continue;
      replaceFile(id, choice.group, next);
      changed = true;
    }
    if (!changed) return;
    state.currentHistoryId = null;
    ctx.log.clear();
    render();
    await ctx.flow.filesAdded();
  }

  const repickableFileIds = (): string[] => state.files.filter((file) => canRepickLanguage(file, unsettledFileIds)).map(({ id }) => id);

  function retryRejectedInput(index: number): void {
    const retry = state.rejectedInputs[index]?.retry;
    if (!retry) return;
    state.rejectedInputs = state.rejectedInputs.filter((_, position) => position !== index);
    duplicateNotices = [];
    render();
    enqueueIngest(Promise.resolve({ sources: [], rejectedInputs: [], matroskaFiles: [retry] }));
  }

  queue.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    if (target.closest("[data-repick-all]")) {
      void repickLanguages(repickableFileIds());
      return;
    }
    const repickId = target.closest<HTMLElement>("[data-repick-file]")?.dataset.repickFile;
    if (repickId) {
      void repickLanguages([repickId]);
      return;
    }
    const retryIndex = (event.target as HTMLElement).closest<HTMLElement>("[data-retry-input]")?.dataset.retryInput;
    if (retryIndex !== undefined) {
      retryRejectedInput(Number(retryIndex));
      return;
    }
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-remove-file], [data-remove-input]");
    if (!button) return;
    if (button.dataset.removeFile) {
      clearedSnapshot ??= snapshotWorkspace();
      state.files = state.files.filter((file) => file.id !== button.dataset.removeFile);
      clearControl?.resumePending(UNDO_WINDOW_MS);
    } else {
      const removedIndex = Number(button.dataset.removeInput);
      const keep = (inputs: WorkspaceState["rejectedInputs"]): WorkspaceState["rejectedInputs"] => inputs.filter((_, index) => index !== removedIndex);
      state.rejectedInputs = keep(state.rejectedInputs);
      if (clearedSnapshot) clearedSnapshot.rejectedInputs = keep(clearedSnapshot.rejectedInputs);
    }
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
