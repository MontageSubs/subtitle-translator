import { t } from "../../i18n";
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
import type { WorkspaceContext } from "./context";

const REFRESH_DEBOUNCE_MS = 200;
const OUTPUT_FORMATS: SubtitleFormat[] = ["srt", "vtt", "ass"];

export interface ResultPanelHandle {
  present(elapsedMs?: number): Promise<void>;
  scheduleRefresh(): void;
}

function renderStatusMetric(missingTotal: number): { className: string; html: string } {
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
  const metricElapsed = ctx.query<HTMLElement>("#metric-elapsed");

  let downloadUrl: string | null = null;
  let refreshTimer: number | undefined;

  const targetLang = () => ctx.language.targetCode();

  function renderFile(fileId: string) {
    const file = state.files.find((candidate) => candidate.id === fileId);
    return file ? renderFileOutput(state, file, targetLang()) : null;
  }

  function downloadSingleFile(fileId: string): void {
    const output = renderFile(fileId);
    if (!output) return;
    saveBlob(output.blob, output.filename);
    setTranslationCompletedNotDownloaded(false);
  }

  function renderFileList(): void {
    fileList.hidden = state.files.length <= 1;
    if (fileList.hidden) {
      fileList.innerHTML = "";
      return;
    }
    fileList.innerHTML = state.files.map((file) => {
      const missing = file.jobResult?.missing_cues.length ?? 0;
      const status = missing === 0
        ? renderCheckIcon(14, 2.5, "task-file-row__status task-file-row__status--ok")
        : `<span class="task-file-row__status task-file-row__status--warning">${missing}</span>`;
      return `
        <div class="task-file-row">
          ${status}
          <span class="task-file-row__name" title="${escapeHtml(file.filename)}">${escapeHtml(file.filename)}</span>
          <span class="task-file-row__actions">
            <button type="button" class="icon-btn" data-file-preview="${file.id}" aria-label="${t("preview.button")}">${EYE_ICON}</button>
            <button type="button" class="icon-btn" data-file-download="${file.id}" aria-label="${t("history.download")}">${DOWNLOAD_ICON}</button>
          </span>
        </div>`;
    }).join("");
  }

  function setDownloadTarget(blob: Blob, filename: string, formatLabel: string): void {
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    downloadUrl = URL.createObjectURL(blob);
    downloadLink.href = downloadUrl;
    downloadLink.download = filename;
    downloadLabel.textContent = `${t("download.button")} (${formatLabel})`;
  }

  async function refreshDownloadTarget(): Promise<void> {
    if (state.files.length === 1) {
      const output = renderFile(state.files[0].id);
      if (output) setDownloadTarget(output.blob, output.filename, state.outputFormat.toUpperCase());
      return;
    }
    const entries = state.files.flatMap((file) => {
      const output = renderFileOutput(state, file, targetLang());
      return output ? [{ path: withDirectoryOf(file.relativePath, output.filename), content: output.rendered }] : [];
    });
    setDownloadTarget(await buildOutputZip(entries), `translated_${targetLang()}.zip`, "ZIP");
  }

  function scheduleRefresh(): void {
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => {
      if (!completedView.hidden) void refreshDownloadTarget();
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

  async function present(elapsedMs?: number): Promise<void> {
    setTranslationCompletedNotDownloaded(true);
    await refreshDownloadTarget();

    const missingTotal = state.files.reduce((sum, file) => sum + (file.jobResult?.missing_cues.length ?? 0), 0);
    const status = renderStatusMetric(missingTotal);
    metricStatus.className = status.className;
    metricStatus.innerHTML = status.html;
    ctx.query<HTMLElement>("#metric-status-lbl").textContent = t("field.status");
    metricCues.textContent = state.files.length.toLocaleString();
    ctx.query<HTMLElement>("#metric-cues-lbl").textContent = t("field.cues");
    metricElapsed.textContent = `${((elapsedMs ?? 1000) / 1000).toFixed(1)}s`;

    syncFormatMenu();
    previewButton.hidden = state.files.length > 1;
    renderFileList();
    ctx.task.setState("completed", { elapsedMs });
  }

  fileList.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-file-preview], [data-file-download]");
    if (!button) return;
    if (button.dataset.filePreview) openFilePreview(ctx, button.dataset.filePreview);
    else if (button.dataset.fileDownload) downloadSingleFile(button.dataset.fileDownload);
  }, { signal });

  downloadLink.addEventListener("click", () => setTranslationCompletedNotDownloaded(false), { signal });

  previewButton.addEventListener("click", () => {
    if (state.files.length === 1) openFilePreview(ctx, state.files[0].id);
  }, { signal });

  formatMenu.addEventListener("toggle", repositionFormatPopover, { signal });
  formatOptions.forEach((option) => {
    option.addEventListener("click", () => {
      const format = option.dataset.format as SubtitleFormat | undefined;
      if (!format || !state.files.some((file) => file.jobResult)) return;
      state.outputFormat = format;
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
    onConfirm: () => ctx.task.setState("ready"),
    signal,
  });

  ctx.query<HTMLButtonElement>("#task-cancel-btn").addEventListener("click", () => ctx.task.setState("ready"), { signal });
  ctx.query<HTMLButtonElement>("#task-retry-btn").addEventListener("click", () => ctx.query<HTMLButtonElement>("#start").click(), { signal });

  signal.addEventListener("abort", () => {
    window.clearTimeout(refreshTimer);
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  }, { once: true });

  return { present, scheduleRefresh };
}
