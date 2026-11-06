import { isUpstreamFileUrl, modelDescriptorPath } from "../../config/assetLayout";
import { resolveModelUrl } from "./transfer";
import type { ModelFileSpec, ModelManifest } from "./types";

const SOURCES = __MODEL_SOURCES__;

export const isMirrored = (manifest: ModelManifest, file: ModelFileSpec): boolean => manifest.mirror !== false && (file.urls ?? []).some(isUpstreamFileUrl);

const mirrorDescriptorUrls = (modelId: string, fileName: string): string[] => SOURCES.map((source) => new URL(`${source}/${modelDescriptorPath(modelId, fileName)}`, location.origin).href);

export function downloadUrls(manifest: ModelManifest, file: ModelFileSpec): string[] {
  const urls = file.urls ?? [];
  const direct = urls.filter((url) => !isUpstreamFileUrl(url)).map(resolveModelUrl);
  const mirrors = isMirrored(manifest, file) ? mirrorDescriptorUrls(manifest.id, file.name) : [];
  const upstream = manifest.upstream === false ? [] : urls.filter(isUpstreamFileUrl);
  return [...direct, ...mirrors, ...upstream];
}
