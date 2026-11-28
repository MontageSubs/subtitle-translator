import { claimRescue, isAllowanceExhausted, isRescueClaimable, selectChannel, type Channel } from "../../api/translation";
import { totalUnfinishedCues } from "./fileCompletion";
import type { WorkspaceState } from "./state";

const CONSECUTIVE_LIMITS_BEFORE_RESCUE = 2;

export interface TranslationTask {
  readonly fileIds: ReadonlySet<string>;
  readonly provider: string;
  readonly targetLang: string;
  consecutiveLimits: number;
  channel: Channel;
  running: boolean;
}

const covers = (task: TranslationTask, { files, provider, targetLang }: WorkspaceState): boolean =>
  files.length > 0 && task.provider === provider && task.targetLang === targetLang && files.every((file) => task.fileIds.has(file.id));

const taskInView = (state: WorkspaceState): TranslationTask | null =>
  state.translationTask && covers(state.translationTask, state) ? state.translationTask : null;

export function followTaskChannel(state: WorkspaceState): void {
  if (state.translationTask?.running) return;
  const task = taskInView(state);
  if (task?.channel === "armed" && !isRescueClaimable()) task.channel = "main";
  selectChannel(task?.channel ?? "main");
}

export function beginTaskRun(state: WorkspaceState): TranslationTask {
  const task: TranslationTask = taskInView(state) ?? {
    fileIds: new Set(state.files.map((file) => file.id)),
    provider: state.provider,
    targetLang: state.targetLang,
    consecutiveLimits: 0,
    channel: "main",
    running: false,
  };
  if (task.channel === "armed") {
    task.channel = claimRescue() ? "rescue" : "main";
    if (task.channel === "rescue") task.consecutiveLimits = 0;
  }
  state.translationTask = task;
  selectChannel(task.channel);
  task.running = true;
  return task;
}

export function noteTaskRequestSucceeded(state: WorkspaceState): void {
  if (state.translationTask?.running) state.translationTask.consecutiveLimits = 0;
}

export function noteTaskLimited(task: TranslationTask): void {
  task.consecutiveLimits += 1;
}

export const exhaustedRescue = (task: TranslationTask): boolean => task.channel === "rescue" && isAllowanceExhausted();

export function endTaskRun(state: WorkspaceState, task: TranslationTask, failed: boolean): void {
  task.running = false;
  if (failed && task.channel === "rescue") task.channel = "main";
  if (state.translationTask === task && totalUnfinishedCues(state.files) === 0) state.translationTask = null;
  followTaskChannel(state);
}

export function abandonTask(state: WorkspaceState): void {
  state.translationTask = null;
}

export function rescueToggle(state: WorkspaceState): "arm" | "disarm" | null {
  const task = taskInView(state);
  if (!task || task.running || task.channel === "rescue" || totalUnfinishedCues(state.files) === 0) return null;
  if (task.channel === "armed") return "disarm";
  return task.consecutiveLimits >= CONSECUTIVE_LIMITS_BEFORE_RESCUE && isRescueClaimable() ? "arm" : null;
}

export function toggleRescue(state: WorkspaceState): void {
  const task = taskInView(state);
  const action = rescueToggle(state);
  if (!task || !action) return;
  task.channel = action === "arm" ? "armed" : "main";
  followTaskChannel(state);
}

export function disarmRescue(state: WorkspaceState): void {
  if (rescueToggle(state) === "disarm") toggleRescue(state);
}
