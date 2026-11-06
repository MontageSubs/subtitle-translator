import { resolve } from "node:path";
import type { Plugin } from "vite";
import { PARTS_DESCRIPTOR_SUFFIX } from "../src/config/assetLayout";
import { RUNTIME_ROOT, isAssetSegment, type RuntimeAssets } from "../src/config/runtimeAssets";
import { descriptorOf } from "../hosting/layout";
import { describeLocalFile, readRange, type DescribedFile } from "../hosting/localFile";
import { describeRuntimeFiles, installedOrtVersion, ortDistDir } from "../runtime/ortPackage";

const DEV_MOUNT = "/_runtime";

export interface RuntimeAssetsBuild {
  assets: RuntimeAssets;
  sources: string[];
}

export function resolveRuntimeAssets(appDir: string, env: Record<string, string | undefined>): RuntimeAssetsBuild {
  const version = installedOrtVersion(appDir);
  if (!version || !isAssetSegment(version)) throw new Error("onnxruntime-web must be installed with a path-safe version");
  const configured = (env.VITE_RUNTIME_SOURCES ?? "").split(",").map((source) => source.trim().replace(/\/+$/, "")).filter(Boolean);
  if (configured.length === 0 && env.GITHUB_ACTIONS === "true") throw new Error("VITE_RUNTIME_SOURCES must list the runtime asset origins for CI builds");
  return { assets: { version, files: describeRuntimeFiles(ortDistDir(appDir)) }, sources: configured.length > 0 ? configured : [DEV_MOUNT] };
}

export function runtimeAssetsPlugin(appDir: string, { assets }: RuntimeAssetsBuild): Plugin {
  const prefix = `${DEV_MOUNT}/${RUNTIME_ROOT}/${assets.version}/`;
  const described = new Map<string, DescribedFile>();
  const pathOf = (name: string): string => resolve(ortDistDir(appDir), name);
  const describe = (name: string): DescribedFile => {
    const known = described.get(name) ?? describeLocalFile(pathOf(name), name);
    described.set(name, known);
    return known;
  };
  const bodyOf = (entry: string): Buffer | null => {
    if (entry.endsWith(PARTS_DESCRIPTOR_SUFFIX)) {
      const name = entry.slice(0, -PARTS_DESCRIPTOR_SUFFIX.length);
      return name in assets.files ? Buffer.from(JSON.stringify(descriptorOf(name, describe(name)))) : null;
    }
    const name = Object.keys(assets.files).find((candidate) => entry === candidate || entry.startsWith(`${candidate}.part`));
    if (!name) return null;
    const file = describe(name);
    let offset = 0;
    for (const [index, part] of descriptorOf(name, file).parts.entries()) {
      if (part.path === entry) return readRange(pathOf(name), offset, file.parts[index]!.bytes);
      offset += part.bytes;
    }
    return null;
  };
  const serve = (request: { url?: string }, response: import("node:http").ServerResponse, next: () => void): void => {
    const path = (request.url ?? "").split("?")[0]!;
    const entry = path.startsWith(prefix) ? decodeURIComponent(path.slice(prefix.length)) : null;
    const body = entry === null ? null : bodyOf(entry);
    if (!body) return next();
    response.setHeader("Content-Type", entry!.endsWith(PARTS_DESCRIPTOR_SUFFIX) ? "application/json" : "application/octet-stream");
    response.setHeader("Content-Length", body.byteLength);
    response.end(body);
  };
  return {
    name: "runtime-assets",
    configureServer: (server) => void server.middlewares.use(serve),
    configurePreviewServer: (server) => void server.middlewares.use(serve),
  };
}
