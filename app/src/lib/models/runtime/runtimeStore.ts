import { DELETION_UNDO_WINDOW_MS, cancelDeletion, deletionRemainingMs, isDeletionQueued, queueDeletion } from "../../history/deletionQueue";
import { hasWebGpu } from "../webgpuProbe";
import { hasInstalledEngineModel } from "../manager";
import { checkRuntimeCompatibility, type ModelIncompatibility } from "../compatibility";
import { discardIdleRuntimeTransfers, ensureRuntimeCached, isRuntimeTransferActive, removeRuntimeAssets, runtimeTransferProgress, runtimeUsage, subscribeRuntimeTransfers, type RuntimeTransferProgress, type RuntimeUsage } from "./ortAssets";

export type RuntimePhase = "checking" | "absent" | "installed" | "downloading" | "paused" | "failed" | "unsupported";

export interface RuntimeView {
  phase: RuntimePhase;
  usage: RuntimeUsage | null;
  progress: RuntimeTransferProgress | null;
  incompatibility: ModelIncompatibility | null;
}

const REMOVAL_KEY = "runtime";

let view: RuntimeView = { phase: "checking", usage: null, progress: null, incompatibility: null };
let installation: AbortController | null = null;
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

export const isRuntimeControllable = (): boolean => installation !== null;

const transferPhase = (): RuntimePhase => (installation !== null || isRuntimeTransferActive() ? "downloading" : "paused");

export async function refreshRuntime(): Promise<void> {
  const [usage, incompatibility] = await Promise.all([runtimeUsage(), checkRuntimeCompatibility()]);
  const progress = runtimeTransferProgress();
  if (incompatibility && !usage.installed && !progress) return publish({ usage, progress: null, incompatibility, phase: "unsupported" });
  publish({ usage, progress, incompatibility: null, phase: usage.installed ? "installed" : progress ? transferPhase() : view.phase === "failed" ? "failed" : "absent" });
}

export async function installRuntime(): Promise<void> {
  if (installation || view.phase === "unsupported") return;
  const own = new AbortController();
  installation = own;
  publish({ phase: "downloading", progress: runtimeTransferProgress() });
  try {
    await ensureRuntimeCached((await hasWebGpu()) ? "webgpu" : "wasm", own.signal);
    await refreshRuntime();
  } catch {
    if (!own.signal.aborted) publish({ phase: "failed", progress: null });
  } finally {
    if (installation === own) installation = null;
  }
}

export function pauseRuntime(): void {
  if (!installation) return;
  installation.abort();
  installation = null;
  publish({ phase: "paused", progress: runtimeTransferProgress() });
}

export function cancelRuntime(): void {
  installation?.abort();
  installation = null;
  discardIdleRuntimeTransfers();
  if (!runtimeTransferProgress()) publish({ phase: "absent", progress: null });
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
  if (progress) publish({ phase: transferPhase(), progress });
  else void refreshRuntime();
});
