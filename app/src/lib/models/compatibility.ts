import { STORAGE_NAMESPACE } from "../../config/storage";

export type ModelIncompatibility = "workers" | "webassembly" | "simd" | "cache";

const PROBE_CACHE_NAME = `${STORAGE_NAMESPACE}:probe`;
const SIMD_PROBE = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);

let cached: Promise<ModelIncompatibility | null> | null = null;

async function probe(): Promise<ModelIncompatibility | null> {
  if (typeof Worker === "undefined") return "workers";
  if (typeof WebAssembly !== "object") return "webassembly";
  if (!WebAssembly.validate(SIMD_PROBE)) return "simd";
  try {
    await caches.open(PROBE_CACHE_NAME);
    await caches.delete(PROBE_CACHE_NAME);
  } catch {
    return "cache";
  }
  return null;
}

export function checkModelCompatibility(): Promise<ModelIncompatibility | null> {
  cached ??= probe();
  return cached;
}
