import { hasWebGpu } from "../webgpuProbe";
import type { NerBackend } from "./inference";
import type { NerFileKeys } from "./protocol";

export const WEBGPU_MODEL_ROLE = "modelWebgpu";

export async function preferredBackends(keys: NerFileKeys): Promise<NerBackend[]> {
  const webgpu = keys.providers.includes("webgpu") && WEBGPU_MODEL_ROLE in keys.files && (await hasWebGpu());
  return webgpu ? ["webgpu", "wasm"] : ["wasm"];
}
