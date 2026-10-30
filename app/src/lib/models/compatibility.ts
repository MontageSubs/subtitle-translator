import { STORAGE_NAMESPACE } from "../../config/storage";
import type { ModelManifest, ModelProvider } from "./types";

export type ModelIncompatibility = ModelProvider | "cache";

const PROBE_CACHE_NAME = `${STORAGE_NAMESPACE}:probe`;
const SIMD_PROBE = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);

export const PROVIDER_LABELS: Readonly<Record<ModelProvider, string>> = { wasm: "WebAssembly", webgl: "WebGL", webgpu: "WebGPU" };

const PROVIDER_PROBES: Readonly<Record<ModelProvider, () => boolean>> = {
  wasm: () => typeof WebAssembly === "object" && WebAssembly.validate(SIMD_PROBE),
  webgl: () => typeof document !== "undefined" && document.createElement("canvas").getContext("webgl2") !== null,
  webgpu: () => typeof navigator !== "undefined" && "gpu" in navigator,
};

let cacheProbe: Promise<boolean> | null = null;

function probeCache(): Promise<boolean> {
  cacheProbe ??= caches.open(PROBE_CACHE_NAME).then(() => caches.delete(PROBE_CACHE_NAME)).then(() => true, () => false);
  return cacheProbe;
}

export async function checkModelCompatibility({ runtime }: ModelManifest): Promise<ModelIncompatibility | null> {
  const missing = runtime.providers.find((provider) => !PROVIDER_PROBES[provider]());
  if (missing) return missing;
  return (await probeCache()) ? null : "cache";
}
