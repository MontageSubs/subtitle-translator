import { t } from "../../i18n";
import { SubtitleFile } from "./state";
import type { WorkspaceContext } from "./context";

const TIMER_TICK_MS = 100;
const MIN_ELAPSED_MS = 100;
const INDETERMINATE_CLASS = "task-progress-fill task-progress-fill--indeterminate";

export interface RunProgressHandle {
  readonly fileIndex: number;
  begin(files: SubtitleFile[]): void;
  beginFile(index: number, filename: string): void;
  completeFile(cueCount: number): void;
  report(translated: number, total: number): void;
  showMerging(): void;
  stop(): number;
  elapsedMs(): number;
}

export function mountRunProgress(ctx: WorkspaceContext): RunProgressHandle {
  const label = ctx.query<HTMLElement>("#progress-label");
  const count = ctx.query<HTMLElement>("#progress-count");
  const fill = ctx.query<HTMLElement>("#task-progress-fill");
  const track = ctx.query<HTMLElement>(".task-progress-container");
  const timerText = ctx.query<HTMLElement>("#task-elapsed-timer");

  let timerId: number | undefined;
  let startedAt = 0;
  let fileIndex = 0;
  let totalFiles = 0;
  let totalCues = 0;
  let completedCues = 0;

  function setIndeterminate(): void {
    fill.className = INDETERMINATE_CLASS;
    fill.style.width = "";
    track.removeAttribute("aria-valuenow");
  }

  function setPercent(percent: number): void {
    fill.className = "task-progress-fill";
    fill.style.width = `${percent}%`;
    track.setAttribute("aria-valuenow", String(percent));
  }

  function render(fileTranslated = 0, fileTotal = 0): void {
    const fileLabel = totalFiles > 1 ? t("progress.fileOf", { current: fileIndex + 1, total: totalFiles }) : "";
    if (!fileTotal) {
      count.textContent = fileLabel;
      return;
    }
    const overall = completedCues + fileTranslated;
    setPercent(totalCues > 0 ? Math.min(100, Math.round((overall / totalCues) * 100)) : 0);
    const cueLabel = totalCues > 0
      ? `${overall} / ${totalCues} ${t("progress.cueUnit")}`
      : `${fileTranslated} / ${fileTotal} ${t("progress.cueUnit")}`;
    count.textContent = fileLabel ? `${fileLabel} · ${cueLabel}` : cueLabel;
  }

  function stopTimer(): void {
    window.clearInterval(timerId);
    timerId = undefined;
  }

  function begin(files: SubtitleFile[]): void {
    stopTimer();
    label.textContent = t("progress.translating");
    totalFiles = files.length;
    fileIndex = 0;
    totalCues = files.reduce((sum, file) => sum + file.cues.length, 0);
    completedCues = 0;
    setIndeterminate();
    render();
    startedAt = performance.now();
    timerText.textContent = "0.0s";
    timerId = window.setInterval(() => {
      timerText.textContent = `${((performance.now() - startedAt) / 1000).toFixed(1)}s`;
    }, TIMER_TICK_MS);
  }

  function beginFile(index: number, filename: string): void {
    fileIndex = index;
    label.textContent = totalFiles > 1 ? t("progress.translatingFile", { name: filename }) : t("progress.translating");
    setIndeterminate();
    render();
  }

  function stop(): number {
    stopTimer();
    return startedAt > 0 ? Math.max(MIN_ELAPSED_MS, Math.round(performance.now() - startedAt)) : 0;
  }

  ctx.signal.addEventListener("abort", stopTimer, { once: true });

  return {
    get fileIndex() { return fileIndex; },
    begin,
    beginFile,
    completeFile(cueCount) { completedCues += cueCount; },
    report: (translated, total) => render(translated, total),
    showMerging() { label.textContent = t("progress.merging"); },
    stop,
    elapsedMs: () => (startedAt > 0 ? performance.now() - startedAt : 0),
  };
}
