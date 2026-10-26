import { labelAttrs } from "../../utils/labelAttrs";
import { getLocale, t } from "../../i18n";
import { buildOutputZip, withDirectoryOf } from "../../lib/subtitle/archive";
import { setTranslationCompletedNotDownloaded } from "../../lib/unsavedChanges";
import { keepPopoverInViewport } from "../../utils/popoverPlacement";
import { escapeHtml } from "../../utils/escapeHtml";
import { saveBlob } from "../../utils/download";
import { renderCheckIcon, renderWarningIcon, EYE_ICON, DOWNLOAD_ICON } from "../../render/icons";
import { mountConfirmButton } from "../../components/confirmButton";
import { SubtitleFormat } from "../../lib/subtitle/types";
import { renderFileOutput } from "./outputRender";
import { openFilePreview } from "./previewBridge";
import { discardTranslations } from "./translationSignature";
import type { WorkspaceContext } from "./context";

const REFRESH_DEBOUNCE_MS = 200;
const OUTPUT_FORMATS: SubtitleFormat[] = ["srt", "vtt", "ass"];

export interface PartialNotice {
  text: string;
  feedbackLink: boolean;
}

export interface ResultPanelHandle {
  present(elapsedMs?: number, partialNotice?: PartialNotice): Promise<void>;
  scheduleRefresh(): void;
  reset(): void;
}

function renderStatusMetric(missingTotal: number, pending: { done: number; total: number } | null): { className: string; html: string } {
  if (pending) {
    return {
      className: "task-metric__value task-metric__value--warning",
      html: `${renderWarningIcon()}<span>${t("task.partial.status", { done: pending.done, total: pending.total })}</span>`,
    };
  }
  if (missingTotal === 0) {
    return { className: "task-metric__value task-metric__value--status", html: `${renderCheckIcon()}<span>${t("task.status.done")}</span>` };
  }
  return {
    className: "task-metric__value task-metric__value--warning",
    html: `${renderWarningIcon()}<span>${t("task.quality.missingCues", { count: missingTotal.toLocaleString() })}</span>`,
  };
}

export function mountResultPanel(ctx: WorkspaceContext): ResultPanelHandle {
  const { state, signal } = ctx;
  const completedView = ctx.query<HTMLElement>("#task-view-completed");
  const downloadLink = ctx.query<HTMLAnchorElement>("#download-link");
  const downloadLabel = ctx.query<HTMLElement>("#download-button-label");
  const formatMenu = ctx.query<HTMLDetailsElement>("#task-format-menu");
  const formatPopover = ctx.query<HTMLElement>(".task-format-popover");
  const formatOptions = ctx.root.querySelectorAll<HTMLButtonElement>(".task-format-option");
  const fileList = ctx.query<HTMLElement>("#task-file-list");
  const previewButton = ctx.query<HTMLButtonElement>("#preview-button");
  const metricStatus = ctx.query<HTMLElement>("#metric-status");
  const metricCues = ctx.query<HTMLElement>("#metric-cues");
  const metricCuesLabel = ctx.query<HTMLElement>("#metric-cues-lbl");
  const metricElapsed = ctx.query<HTMLElement>("#metric-elapsed");
  const partialBanner = ctx.query<HTMLElement>("#task-partial-banner");
  const partialText = ctx.query<HTMLElement>("#task-partial-text");
  const partialHelp = ctx.query<HTMLElement>("#task-partial-help");
  const resumeButton = ctx.query<HTMLButtonElement>("#task-resume-btn");
  const resumeLabel = ctx.query<HTMLElement>("#task-resume-label");

  let downloadUrl: string | null = null;
  let downloadFormatLabel = "";
  let linkedSignature = "";
  let settledSignature = "";
  let downloaded = true;
  let refreshTimer: number | undefined;

  function reset(): void {
    window.clearTimeout(refreshTimer);
    settledSignature = "";
    linkedSignature = "";
    downloaded = true;
    setTranslationCompletedNotDownloaded(false);
  }

  const targetLang = () => ctx.language.targetCode();

  function renderFile(fileId: string) {
    const file = state.files.find((candidate) => candidate.id === fileId);
    return file ? renderFileOutput(state, file, targetLang()) : null;
  }

  function downloadSingleFile(fileId: string): void {
    const output = renderFile(fileId);
    if (!output) return;
    saveBlob(output.blob, output.filename);
    if (state.files.length === 1) {
      downloaded = true;
      settledSignature = linkedSignature;
      renderDownloadLabel();
      syncUnsavedState();
    }
  }

  function renderFileList(): void {
    fileList.hidden = state.files.length <= 1;
    if (fileList.hidden) {
      fileList.innerHTML = "";
      return;
    }
    fileList.innerHTML = state.files.map((file) => {
      if (!file.jobResult) {
        return `
        <div class="task-file-row">
          <span class="task-file-row__status task-file-row__status--warning" aria-hidden="true">!</span>
          <span class="task-file-row__name" title="${escapeHtml(file.filename)}">${escapeHtml(file.filename)}</span>
          <span class="task-file-row__note">${t("task.file.pending")}</span>
        </div>`;
      }
      const missing = file.jobResult.missing_cues.length;
      const status = missing === 0
        ? renderCheckIcon(14, 2.5, "task-file-row__status task-file-row__status--ok")
        : `<span class="task-file-row__status task-file-row__status--warning">${missing}</span>`;
      return `
        <div class="task-file-row">
          ${status}
          <span class="task-file-row__name" title="${escapeHtml(file.filename)}">${escapeHtml(file.filename)}</span>
          <span class="task-file-row__actions">
            <button type="button" class="icon-btn" data-file-preview="${file.id}" ${labelAttrs(t("preview.button"))}>${EYE_ICON}</button>
            <button type="button" class="icon-btn" data-file-download="${file.id}" ${labelAttrs(t("history.download"))}>${DOWNLOAD_ICON}</button>
          </span>
        </div>`;
    }).join("");
  }

  const isDownloadStale = (): boolean =>
    Boolean(settledSignature && linkedSignature !== settledSignature);

  function syncUnsavedState(): void {
    const hasJob = state.files.some((file) => file.jobResult);
    setTranslationCompletedNotDownloaded(hasJob && (!downloaded || isDownloadStale()));
  }

  function renderDownloadLabel(): void {
    const stale = isDownloadStale();
    downloadLabel.textContent = `${t("download.button")} (${downloadFormatLabel})${stale ? " *" : ""}`;
    downloadLink.title = stale ? t("download.stale") : t("tip.download");
  }

  function setDownloadTarget(blob: Blob, filename: string, formatLabel: string, signature: string): void {
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    downloadUrl = URL.createObjectURL(blob);
    downloadLink.href = downloadUrl;
    downloadLink.download = filename;
    downloadFormatLabel = formatLabel;
    linkedSignature = signature;
    if (!settledSignature && state.files.some((file) => file.jobResult)) settledSignature = signature;
    renderDownloadLabel();
    syncUnsavedState();
  }

  async function refreshDownloadTarget(): Promise<void> {
    if (state.files.length === 1) {
      const output = renderFile(state.files[0].id);
      if (output) setDownloadTarget(output.blob, output.filename, state.outputFormat.toUpperCase(), `${output.filename}\0${output.rendered}`);
      return;
    }
    const entries = state.files.flatMap((file) => {
      const output = renderFileOutput(state, file, targetLang());
      return output ? [{ path: withDirectoryOf(file.relativePath, output.filename), content: output.rendered }] : [];
    });
    const signature = entries.map((entry) => `${entry.path}\0${entry.content}`).join("\u0001");
    setDownloadTarget(await buildOutputZip(entries), `translated_${targetLang()}.zip`, "ZIP", signature);
  }

  function scheduleRefresh(): void {
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => {
      if (completedView.hidden) return;
      void refreshDownloadTarget();
    }, REFRESH_DEBOUNCE_MS);
  }

  function repositionFormatPopover(): void {
    if (formatMenu.open) keepPopoverInViewport(formatPopover, "task-format-popover--flip-up");
  }

  function syncFormatMenu(): void {
    formatOptions.forEach((option) => {
      option.classList.toggle("task-format-option--active", option.dataset.format === state.outputFormat);
    });
    formatMenu.hidden = OUTPUT_FORMATS.length < 2;
    repositionFormatPopover();
  }

  async function present(elapsedMs?: number, partialNotice?: PartialNotice): Promise<void> {
    await refreshDownloadTarget();
    if (elapsedMs !== undefined) {
      state.elapsedMs = elapsedMs;
      settledSignature = linkedSignature;
      downloaded = false;
      renderDownloadLabel();
      syncUnsavedState();
    }

    const translatedFiles = state.files.filter((file) => file.jobResult).length;
    const pendingFiles = state.files.length - translatedFiles;
    const missingTotal = state.files.reduce((sum, file) => sum + (file.jobResult?.missing_cues.length ?? 0), 0);
    const status = renderStatusMetric(missingTotal, pendingFiles > 0 ? { done: translatedFiles, total: state.files.length } : null);
    partialBanner.hidden = pendingFiles === 0 && !partialNotice;
    partialText.textContent = partialNotice?.text ?? t("task.partial.pending");
    partialHelp.hidden = !partialNotice?.feedbackLink;
    resumeButton.hidden = pendingFiles === 0;
    resumeLabel.textContent = t("task.retryFailed", { count: pendingFiles });
    metricStatus.className = status.className;
    metricStatus.innerHTML = status.html;
    ctx.query<HTMLElement>("#metric-status-lbl").textContent = t("field.status");
    const singleFile = state.files.length === 1;
    const translatedCues = state.files.reduce((sum, file) => sum + (file.jobResult?.cues.length ?? 0), 0);
    metricCues.textContent = (singleFile ? translatedCues : translatedFiles).toLocaleString(getLocale());
    metricCuesLabel.textContent = t(singleFile ? "field.cues" : "field.subtitles");
    metricElapsed.textContent = state.elapsedMs === null ? "—" : `${(state.elapsedMs / 1000).toFixed(1)}s`;

    syncFormatMenu();
    previewButton.hidden = state.files.length > 1;
    renderFileList();
    ctx.task.setState("completed");
  }

  fileList.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-file-preview], [data-file-download]");
    if (!button) return;
    if (button.dataset.filePreview) openFilePreview(ctx, button.dataset.filePreview);
    else if (button.dataset.fileDownload) downloadSingleFile(button.dataset.fileDownload);
  }, { signal });

  downloadLink.addEventListener("click", () => {
    downloaded = true;
    settledSignature = linkedSignature;
    renderDownloadLabel();
    syncUnsavedState();
  }, { signal });

  previewButton.addEventListener("click", () => {
    if (state.files.length === 1) openFilePreview(ctx, state.files[0].id);
  }, { signal });

  formatMenu.addEventListener("toggle", repositionFormatPopover, { signal });
  formatOptions.forEach((option) => {
    option.addEventListener("click", () => {
      const format = option.dataset.format as SubtitleFormat | undefined;
      if (!format || !state.files.some((file) => file.jobResult)) return;
      state.outputFormat = format;
      ctx.output.sync();
      void present();
      formatMenu.open = false;
    }, { signal });
  });
  document.addEventListener("click", (event) => {
    if (formatMenu.open && !formatMenu.contains(event.target as Node)) formatMenu.open = false;
  }, { signal });

  mountConfirmButton({
    button: ctx.query<HTMLButtonElement>("#retranslate-button"),
    label: ctx.query<HTMLElement>("#retranslate-label"),
    idleText: () => t("task.retranslate"),
    confirmText: () => t("task.retranslateConfirm"),
    onConfirm: () => {
      discardTranslations(state);
      reset();
      ctx.task.setState("ready");
    },
    signal,
  });

  ctx.query<HTMLButtonElement>("#task-cancel-btn").addEventListener("click", () => ctx.task.setState("ready"), { signal });
  (["#task-retry-btn", "#task-resume-btn"] as const).forEach((selector) => {
    ctx.query<HTMLButtonElement>(selector).addEventListener("click", () => ctx.query<HTMLButtonElement>("#start").click(), { signal });
  });

  signal.addEventListener("abort", () => {
    window.clearTimeout(refreshTimer);
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  }, { once: true });

  return { present, scheduleRefresh, reset };
}
