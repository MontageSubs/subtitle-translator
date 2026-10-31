export const RUNTIME_BACKEND_FILES = {
  wasm: { binary: "ort-wasm-simd-threaded.wasm", glue: "ort-wasm-simd-threaded.mjs" },
  webgpu: { binary: "ort-wasm-simd-threaded.asyncify.wasm", glue: "ort-wasm-simd-threaded.asyncify.mjs" },
} as const;

export const RUNTIME_FILE_NAMES: readonly string[] = Object.values(RUNTIME_BACKEND_FILES).flatMap(({ binary, glue }) => [binary, glue]);
export const RUNTIME_MIME_TYPES = { wasm: "application/wasm", mjs: "text/javascript" } as const;
export const RUNTIME_PART_BYTES = 16 * 1024 * 1024;
export const RUNTIME_RESOLVE_CONDITION = "onnxruntime-web-use-extern-wasm";
export const RUNTIME_ROOT = "ort";

const RUNTIME_VERSION_PATTERN = /^[0-9A-Za-z][0-9A-Za-z.+-]*$/;

export type RuntimeBackend = keyof typeof RUNTIME_BACKEND_FILES;

export interface RuntimeFileDescriptor {
  bytes: number;
  sha256: string;
}

export interface RuntimeAssets {
  version: string;
  files: Readonly<Record<string, RuntimeFileDescriptor>>;
}

export const isRuntimeVersion = (value: string): boolean => RUNTIME_VERSION_PATTERN.test(value);

export const runtimeMimeOf = (name: string): string => RUNTIME_MIME_TYPES[name.endsWith(".mjs") ? "mjs" : "wasm"];

export const runtimePath = (version: string, entry: string): string => `${RUNTIME_ROOT}/${version}/${entry}`;

export const runtimePartNames = (name: string, bytes: number): string[] => {
  const count = Math.max(1, Math.ceil(bytes / RUNTIME_PART_BYTES));
  return count === 1 ? [name] : Array.from({ length: count }, (_, index) => `${name}.part${index}`);
};

export const runtimePart = (bytes: Uint8Array, index: number): Uint8Array => bytes.subarray(index * RUNTIME_PART_BYTES, (index + 1) * RUNTIME_PART_BYTES);
