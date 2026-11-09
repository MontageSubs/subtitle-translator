import { DELETION_UNDO_WINDOW_MS, cancelDeletion, deletionRemainingMs, isDeletionQueued, queueDeletion } from "../../history/deletionQueue";
import { hasWebGpu } from "../webgpuProbe";
import { hasInstalledEngineModel } from "../manager";
import { ensureRuntimeCached, removeRuntimeAssets, runtimeTransferProgress, runtimeUsage, subscribeRuntimeTransfers, type RuntimeTransferProgress, type RuntimeUsage } from "./ortAssets";

export type RuntimePhase = "checking" | "absent" | "installed" | "downloading" | "failed";

export interface RuntimeView {
  phase: RuntimePhase;
  usage: RuntimeUsage | null;
  progress: RuntimeTransferProgress | null;
}

const REMOVAL_KEY = "runtime";

let view: RuntimeView = { phase: "checking", usage: null, progress: null };
const listeners = new Set<() => void>();

function publish(next: Partial<RuntimeView>): void {
  view = { ...view, ...next };
  listeners.forEach((listener) => listener());
}

export const runtimeView = (): RuntimeView => view;

export function subscribeRuntime(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

export const isRuntimeRemovable = (): boolean => !hasInstalledEngineModel();

export async function refreshRuntime(): Promise<void> {
  const usage = await runtimeUsage();
  publish({ usage, progress: null, phase: usage.installed ? "installed" : view.phase === "failed" ? "failed" : "absent" });
}

export async function installRuntime(): Promise<void> {
  if (view.phase === "downloading") return;
  publish({ phase: "downloading", progress: runtimeTransferProgress() });
  try {
    await ensureRuntimeCached((await hasWebGpu()) ? "webgpu" : "wasm");
    await refreshRuntime();
  } catch {
    publish({ phase: "failed", progress: null });
  }
}

async function removeRuntime(): Promise<void> {
  if (!isRuntimeRemovable() || view.phase === "downloading") return;
  await removeRuntimeAssets();
  await refreshRuntime();
}

export const isRuntimeRemovalPending = (): boolean => isDeletionQueued(REMOVAL_KEY);

export const runtimeRemovalSecondsLeft = (): number | null => (isRuntimeRemovalPending() ? Math.max(1, Math.ceil(deletionRemainingMs(REMOVAL_KEY) / 1000)) : null);

export function toggleRuntimeRemoval(): void {
  if (!cancelDeletion(REMOVAL_KEY)) {
    if (!isRuntimeRemovable() || view.phase !== "installed") return;
    queueDeletion(REMOVAL_KEY, DELETION_UNDO_WINDOW_MS, removeRuntime);
  }
  publish({});
}

subscribeRuntimeTransfers(() => {
  const progress = runtimeTransferProgress();
  if (progress) publish({ phase: "downloading", progress });
  else void refreshRuntime();
});
