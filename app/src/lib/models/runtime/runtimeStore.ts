import { hasWebGpu } from "../webgpuProbe";
import { listModelViews } from "../manager";
import { ensureRuntimeCached, removeRuntimeAssets, runtimeTransferProgress, runtimeUsage, subscribeRuntimeTransfers, type RuntimeTransferProgress, type RuntimeUsage } from "./ortAssets";

export type RuntimePhase = "checking" | "absent" | "installed" | "downloading" | "failed";

export interface RuntimeView {
  phase: RuntimePhase;
  usage: RuntimeUsage | null;
  progress: RuntimeTransferProgress | null;
}

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

export const isRuntimeRemovable = (): boolean => !listModelViews().some(({ record }) => record !== null);

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

export async function removeRuntime(): Promise<void> {
  if (!isRuntimeRemovable() || view.phase === "downloading") return;
  await removeRuntimeAssets();
  await refreshRuntime();
}

subscribeRuntimeTransfers(() => {
  const progress = runtimeTransferProgress();
  if (progress) publish({ phase: "downloading", progress });
  else void refreshRuntime();
});
