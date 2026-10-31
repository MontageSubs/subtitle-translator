export const RUNTIME_BACKEND_FILES = {
  wasm: { binary: "ort-wasm-simd-threaded.wasm", glue: "ort-wasm-simd-threaded.mjs" },
  webgpu: { binary: "ort-wasm-simd-threaded.asyncify.wasm", glue: "ort-wasm-simd-threaded.asyncify.mjs" },
} as const;

export const RUNTIME_FILE_NAMES: readonly string[] = Object.values(RUNTIME_BACKEND_FILES).flatMap(({ binary, glue }) => [binary, glue]);
export const RUNTIME_MIME_TYPES = { wasm: "application/wasm", mjs: "text/javascript" } as const;
export const RUNTIME_RESOLVE_CONDITION = "onnxruntime-web-use-extern-wasm";
export const RUNTIME_ROOT = "ort";

const ASSET_SEGMENT_PATTERN = /^[0-9A-Za-z][0-9A-Za-z._+-]*$/;

export type RuntimeBackend = keyof typeof RUNTIME_BACKEND_FILES;

export interface RuntimeFileDescriptor {
  bytes: number;
  sha256: string;
}

export interface RuntimeAssets {
  version: string;
  files: Readonly<Record<string, RuntimeFileDescriptor>>;
}

export const isAssetSegment = (value: string): boolean => ASSET_SEGMENT_PATTERN.test(value);

export const runtimeMimeOf = (name: string): string => RUNTIME_MIME_TYPES[name.endsWith(".mjs") ? "mjs" : "wasm"];

export const runtimeKey = (version: string): string => `${RUNTIME_ROOT}/${version}`;

export const runtimePath = (version: string, entry: string): string => `${runtimeKey(version)}/${entry}`;
