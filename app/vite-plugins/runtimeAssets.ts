import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin } from "vite";
import { RUNTIME_ROOT, isRuntimeVersion, runtimePart, type RuntimeAssets } from "../src/config/runtimeAssets";
import { describeRuntimeFiles, installedOrtVersion, ortDistDir } from "../runtime/ortPackage";

const DEV_MOUNT = "/_runtime";
const PART_SUFFIX = /\.part(\d+)$/;

export interface RuntimeAssetsBuild {
  assets: RuntimeAssets;
  sources: string[];
}

export function resolveRuntimeAssets(appDir: string, env: Record<string, string | undefined>): RuntimeAssetsBuild {
  const version = installedOrtVersion(appDir);
  if (!version || !isRuntimeVersion(version)) throw new Error("onnxruntime-web must be installed with a path-safe version");
  const configured = (env.VITE_RUNTIME_SOURCES ?? "").split(",").map((source) => source.trim().replace(/\/+$/, "")).filter(Boolean);
  if (configured.length === 0 && env.GITHUB_ACTIONS === "true") throw new Error("VITE_RUNTIME_SOURCES must list the runtime asset origins for CI builds");
  return { assets: { version, files: describeRuntimeFiles(ortDistDir(appDir)) }, sources: configured.length > 0 ? configured : [DEV_MOUNT] };
}

export function runtimeAssetsPlugin(appDir: string, { assets }: RuntimeAssetsBuild): Plugin {
  const prefix = `${DEV_MOUNT}/${RUNTIME_ROOT}/${assets.version}/`;
  const serve = (request: { url?: string }, response: import("node:http").ServerResponse, next: () => void): void => {
    const path = (request.url ?? "").split("?")[0]!;
    if (!path.startsWith(prefix)) return next();
    const entry = decodeURIComponent(path.slice(prefix.length));
    const name = entry.replace(PART_SUFFIX, "");
    if (!(name in assets.files)) return next();
    const part = PART_SUFFIX.exec(entry);
    const index = part ? Number(part[1]) : 0;
    const bytes = readFileSync(resolve(ortDistDir(appDir), name));
    const body = part ? runtimePart(bytes, index) : bytes;
    response.setHeader("Content-Type", "application/octet-stream");
    response.setHeader("Content-Length", body.byteLength);
    response.end(body);
  };
  return {
    name: "runtime-assets",
    configureServer: (server) => void server.middlewares.use(serve),
    configurePreviewServer: (server) => void server.middlewares.use(serve),
  };
}
