import { hasWebGpu } from "./webgpuProbe";
import type { ModelFileSpec, ModelManifest } from "./types";

const WEBGPU_BACKEND = "webgpu";

let detection: Promise<void> | null = null;
let available: ReadonlySet<string> = new Set();

export function detectBackends(): Promise<void> {
  detection ??= hasWebGpu().then((webgpu) => {
    available = new Set(webgpu ? [WEBGPU_BACKEND] : []);
  });
  return detection;
}

export const applicableFiles = (manifest: ModelManifest): readonly ModelFileSpec[] => manifest.files.filter(({ backend }) => backend === undefined || available.has(backend));
