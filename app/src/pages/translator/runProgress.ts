import { getLocale, t, th } from "../../i18n";
import { isChallengeGateOpen, isClockHeld, subscribeChallengeGate, subscribeIdleClock } from "../../api/translation";
import { formatElapsed } from "../../utils/elapsedFormat";
import { createSmoothProgress } from "../../utils/smoothProgress";
import { SubtitleFile } from "./state";
import type { WorkspaceContext } from "./context";
import { formatNumber } from "../../utils/numberFormat";

const TIMER_TICK_MS = 100;
const MIN_ELAPSED_MS = 100;
const INDETERMINATE_CLASS = "task-progress-fill task-progress-fill--indeterminate";
const DETERMINATE_CLASS = "task-progress-fill";

export interface RunProgressHandle {
  begin(files: SubtitleFile[], isReused: (file: SubtitleFile) => boolean, resume: boolean): void;
  beginFile(filename: string): void;
  completeFile(cueCount: number): void;
  report(translated: number): void;
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
  let runStartedAt = 0;
  let carriedMs = 0;
  let pausedTotalMs = 0;
  let discountedMs = 0;
  let pausedSince: number | null = null;
  let challengeOpen = false;
  let idleHeld = false;
  let shownElapsedMs = 0;
  let hasRun = false;
  let completedFiles = 0;
  let totalFiles = 0;
  let totalCues = 0;
  let completedCues = 0;
  let announcedPercent = -1;

  function setIndeterminate(): void {
    fill.className = INDETERMINATE_CLASS;
    fill.style.removeProperty("--progress");
    track.removeAttribute("aria-valuenow");
  }

  function paint(fraction: number): void {
    if (!smoother.hasCrawled()) return setIndeterminate();
    if (fill.className !== DETERMINATE_CLASS) fill.className = DETERMINATE_CLASS;
    fill.style.setProperty("--progress", fraction.toFixed(4));
    announce(fraction);
  }

  function announce(fraction: number): void {
    const percent = Math.round(fraction * 100);
    if (percent === announcedPercent) return;
    announcedPercent = percent;
    track.setAttribute("aria-valuenow", String(percent));
  }

  const smoother = createSmoothProgress(paint);

  const fractionOf = (cues: number): number => (totalCues > 0 ? Math.min(1, cues / totalCues) : 0);

  function render(fileTranslated = 0): void {
    const overall = completedCues + fileTranslated;
    if (overall > 0) smoother.set(fractionOf(overall));
    const fileLabel = totalFiles > 1 ? t("progress.fileOf", { current: Math.min(totalFiles, completedFiles + 1), total: totalFiles }) : "";
    const cueLabel = overall > 0 ? `${formatNumber(overall, getLocale())} / ${formatNumber(totalCues, getLocale())} ${th("progress.cueUnit")}` : "";
    count.textContent = [fileLabel, cueLabel].filter(Boolean).join(" · ");
  }

  function syncClock(): void {
    if (runStartedAt === 0) return;
    if (challengeOpen || idleHeld) {
      pausedSince ??= performance.now();
      return;
    }
    if (pausedSince === null) return;
    pausedTotalMs += performance.now() - pausedSince;
    pausedSince = null;
  }

  function runActiveMs(): number {
    if (runStartedAt === 0) return 0;
    const now = performance.now();
    return Math.max(0, now - runStartedAt - pausedTotalMs - discountedMs - (pausedSince === null ? 0 : now - pausedSince));
  }

  const activeElapsedMs = (): number => carriedMs + runActiveMs();

  function stopTimer(): void {
    window.clearInterval(timerId);
    timerId = undefined;
  }

  function begin(files: SubtitleFile[], isReused: (file: SubtitleFile) => boolean, resume: boolean): void {
    stopTimer();
    carriedMs = resume ? (hasRun ? activeElapsedMs() : ctx.state.elapsedMs ?? 0) : 0;
    hasRun = true;
    label.textContent = t("progress.translating");
    const reused = files.filter(isReused);
    totalFiles = files.length;
    completedFiles = reused.length;
    totalCues = files.reduce((sum, file) => sum + file.cues.length, 0);
    completedCues = reused.reduce((sum, file) => sum + file.cues.length, 0);
    const resumedFraction = fractionOf(completedCues);
    announcedPercent = -1;
    smoother.reset(resumedFraction);
    smoother.resume();
    render();
    runStartedAt = performance.now();
    pausedTotalMs = 0;
    discountedMs = 0;
    pausedSince = null;
    challengeOpen = isChallengeGateOpen();
    idleHeld = isClockHeld();
    syncClock();
    shownElapsedMs = carriedMs;
    timerText.textContent = formatElapsed(shownElapsedMs, getLocale());
    timerId = window.setInterval(() => {
      shownElapsedMs = Math.max(shownElapsedMs, activeElapsedMs());
      timerText.textContent = formatElapsed(shownElapsedMs, getLocale());
    }, TIMER_TICK_MS);
  }

  function beginFile(filename: string): void {
    label.textContent = totalFiles > 1 ? t("progress.translatingFile", { name: filename }) : t("progress.translating");
    render();
  }

  function showMerging(): void {
    label.textContent = t("progress.merging");
    smoother.finish();
  }

  function stop(): number {
    stopTimer();
    smoother.stop();
    carriedMs = activeElapsedMs();
    runStartedAt = 0;
    pausedSince = null;
    return carriedMs > 0 ? Math.max(MIN_ELAPSED_MS, Math.round(carriedMs)) : 0;
  }

  const unsubscribeGate = subscribeChallengeGate((open) => {
    challengeOpen = open;
    syncClock();
  });

  const unsubscribeIdleClock = subscribeIdleClock({
    held(active) {
      idleHeld = active;
      syncClock();
    },
    discounted(milliseconds) {
      if (runStartedAt > 0) discountedMs += milliseconds;
    },
  });

  ctx.signal.addEventListener("abort", () => {
    unsubscribeGate();
    unsubscribeIdleClock();
    stopTimer();
    smoother.stop();
  }, { once: true });

  return {
    begin,
    beginFile,
    completeFile(cueCount) {
      completedCues += cueCount;
      completedFiles += 1;
    },
    report: render,
    showMerging,
    stop,
    elapsedMs: activeElapsedMs,
  };
}
