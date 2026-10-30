import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { RUNTIME_FILE_NAMES, type RuntimeFileDescriptor } from "../src/config/runtimeAssets";

export const ORT_PACKAGE = "onnxruntime-web";

export const sha256Of = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

const packageDir = (appDir: string): string => resolve(appDir, "node_modules", ORT_PACKAGE);

export const ortDistDir = (appDir: string): string => resolve(packageDir(appDir), "dist");

export function installedOrtVersion(appDir: string): string | null {
  try {
    const { version } = JSON.parse(readFileSync(resolve(packageDir(appDir), "package.json"), "utf8")) as { version?: string };
    return version ?? null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export function describeRuntimeFiles(distDir: string): Record<string, RuntimeFileDescriptor> {
  return Object.fromEntries(
    RUNTIME_FILE_NAMES.map((name) => {
      const bytes = readFileSync(resolve(distDir, name));
      return [name, { bytes: bytes.byteLength, sha256: sha256Of(bytes) }];
    }),
  );
}
