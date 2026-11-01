import { modelDescriptorPath } from "../../config/assetLayout";

const SOURCES = __MODEL_SOURCES__;

export const mirrorDescriptorUrls = (modelId: string, fileName: string): string[] =>
  SOURCES.map((source) => new URL(`${source}/${modelDescriptorPath(modelId, fileName)}`, location.origin).href);
