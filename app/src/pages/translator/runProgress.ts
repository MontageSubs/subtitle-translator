import { t } from "../../i18n";
import { SubtitleFile } from "./state";
import type { WorkspaceContext } from "./context";

const TIMER_TICK_MS = 100;
const DEFAULT_ARRIVAL_GAP_MS = 4000;
const MIN_CATCH_UP_MS = 1500;
const MAX_CATCH_UP_MS = 4000;
const MIN_CREEP_MS = 3000;
const MAX_CREEP_MS = 6000;
const GAP_SMOOTHING = 0.4;
const VELOCITY_RESPONSE_MS = 350;
const FINISH_RESPONSE_MS = 150;
const MAX_FRAME_MS = 50;
const MAX_LEAD = 0.1;
const LEAD_OF_REMAINING = 0.6;
const CATCH_UP_EPSILON = 0.005;
const FINISHED_EPSILON = 0.001;
const MIN_ELAPSED_MS = 100;
const INDETERMINATE_CLASS = "task-progress-fill task-progress-fill--indeterminate";
const DETERMINATE_CLASS = "task-progress-fill";

export interface RunProgressHandle {
  begin(files: SubtitleFile[], isReused: (file: SubtitleFile) => boolean): void;
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
  let startedAt = 0;
  let completedFiles = 0;
  let totalFiles = 0;
  let totalCues = 0;
  let completedCues = 0;
  let realFraction = 0;
  let shownFraction = 0;
  let velocity = 0;
  let arrivalGapMs = DEFAULT_ARRIVAL_GAP_MS;
  let lastArrivalAt = 0;
  let finishing = false;
  let frameId: number | undefined;
  let lastFrameAt = 0;
  let announcedPercent = -1;

  function setIndeterminate(): void {
    fill.className = INDETERMINATE_CLASS;
    fill.style.removeProperty("--progress");
    track.removeAttribute("aria-valuenow");
  }

  function paint(fraction: number): void {
    if (fill.className !== DETERMINATE_CLASS) fill.className = DETERMINATE_CLASS;
    fill.style.setProperty("--progress", fraction.toFixed(4));
  }

  function announce(fraction: number): void {
    const percent = Math.round(fraction * 100);
    if (percent === announcedPercent) return;
    announcedPercent = percent;
    track.setAttribute("aria-valuenow", String(percent));
  }

  function cancelFrame(): void {
    if (frameId !== undefined) window.cancelAnimationFrame(frameId);
    frameId = undefined;
  }

  function leadFor(real: number): number {
    return Math.min(MAX_LEAD, (1 - real) * LEAD_OF_REMAINING);
  }

  function advance(dtMs: number): void {
    const catchingUp = shownFraction < realFraction - CATCH_UP_EPSILON;
    const target = finishing ? 1 : catchingUp ? realFraction : realFraction + leadFor(realFraction);
    const horizonMs = finishing
      ? FINISH_RESPONSE_MS
      : catchingUp
        ? Math.min(MAX_CATCH_UP_MS, Math.max(MIN_CATCH_UP_MS, arrivalGapMs * 0.5))
        : Math.min(MAX_CREEP_MS, Math.max(MIN_CREEP_MS, arrivalGapMs));
    const desired = Math.max(0, (target - shownFraction) / horizonMs);
    const response = finishing ? FINISH_RESPONSE_MS : VELOCITY_RESPONSE_MS;
    velocity += (desired - velocity) * (1 - Math.exp(-dtMs / response));
    shownFraction = Math.min(target, shownFraction + velocity * dtMs);
  }

  function frame(now: number): void {
    advance(Math.min(MAX_FRAME_MS, now - lastFrameAt));
    lastFrameAt = now;
    paint(shownFraction);
    if (finishing && shownFraction >= 1 - FINISHED_EPSILON) {
      paint(1);
      announce(1);
      frameId = undefined;
      return;
    }
    frameId = window.requestAnimationFrame(frame);
  }

  function startFrames(): void {
    if (frameId !== undefined) return;
    lastFrameAt = performance.now();
    frameId = window.requestAnimationFrame(frame);
  }

  function noteArrival(fraction: number): void {
    if (fraction <= realFraction) return;
    const now = performance.now();
    if (lastArrivalAt > 0) arrivalGapMs = arrivalGapMs * (1 - GAP_SMOOTHING) + (now - lastArrivalAt) * GAP_SMOOTHING;
    lastArrivalAt = now;
    realFraction = fraction;
    announce(fraction);
    startFrames();
  }

  const fractionOf = (cues: number): number => (totalCues > 0 ? Math.min(1, cues / totalCues) : 0);

  function render(fileTranslated = 0): void {
    const overall = completedCues + fileTranslated;
    noteArrival(fractionOf(overall));
    const fileLabel = totalFiles > 1 ? t("progress.fileOf", { current: Math.min(totalFiles, completedFiles + 1), total: totalFiles }) : "";
    const cueLabel = overall > 0 ? `${overall} / ${totalCues} ${t("progress.cueUnit")}` : "";
    count.textContent = [fileLabel, cueLabel].filter(Boolean).join(" · ");
  }

  function stopTimer(): void {
    window.clearInterval(timerId);
    timerId = undefined;
  }

  function begin(files: SubtitleFile[], isReused: (file: SubtitleFile) => boolean): void {
    stopTimer();
    cancelFrame();
    label.textContent = t("progress.translating");
    const reused = files.filter(isReused);
    totalFiles = files.length;
    completedFiles = reused.length;
    totalCues = files.reduce((sum, file) => sum + file.cues.length, 0);
    completedCues = reused.reduce((sum, file) => sum + file.cues.length, 0);
    realFraction = fractionOf(completedCues);
    shownFraction = realFraction;
    velocity = 0;
    arrivalGapMs = DEFAULT_ARRIVAL_GAP_MS;
    lastArrivalAt = 0;
    finishing = false;
    announcedPercent = -1;
    if (realFraction > 0) {
      paint(realFraction);
      announce(realFraction);
      startFrames();
    } else {
      setIndeterminate();
    }
    render();
    startedAt = performance.now();
    timerText.textContent = "0.0s";
    timerId = window.setInterval(() => {
      timerText.textContent = `${((performance.now() - startedAt) / 1000).toFixed(1)}s`;
    }, TIMER_TICK_MS);
  }

  function beginFile(filename: string): void {
    label.textContent = totalFiles > 1 ? t("progress.translatingFile", { name: filename }) : t("progress.translating");
    render();
  }

  function showMerging(): void {
    label.textContent = t("progress.merging");
    finishing = true;
    startFrames();
  }

  function stop(): number {
    stopTimer();
    cancelFrame();
    return startedAt > 0 ? Math.max(MIN_ELAPSED_MS, Math.round(performance.now() - startedAt)) : 0;
  }

  ctx.signal.addEventListener("abort", () => {
    stopTimer();
    cancelFrame();
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
    elapsedMs: () => (startedAt > 0 ? performance.now() - startedAt : 0),
  };
}
