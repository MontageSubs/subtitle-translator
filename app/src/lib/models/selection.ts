import { modelsOfKind } from "./catalog";
import { isModelInstalled, isModelReady, modelView } from "./manager";
import type { ModelKind, ModelManifest } from "./types";

const bySizeAscending = (left: ModelManifest, right: ModelManifest): number => left.sizeHint - right.sizeHint;

export function installedModel(kind: ModelKind, language: string): ModelManifest | undefined {
  const ready = modelsOfKind(kind).filter((model) => model.languages.includes(language) && isModelReady(model.id));
  return ready.sort(bySizeAscending).at(-1);
}

export function selectModel(kind: ModelKind, language: string, applies: (model: ModelManifest) => boolean = () => true): ModelManifest | undefined {
  const candidates = modelsOfKind(kind).filter((model) => model.languages.includes(language) && applies(model));
  const ready = candidates.filter((model) => isModelReady(model.id));
  if (ready.length) return ready.sort(bySizeAscending).at(-1);
  const disabled = candidates.filter((model) => isModelInstalled(model.id));
  if (disabled.length) return disabled.sort(bySizeAscending).at(-1);
  return candidates.filter((model) => !model.deprecated && !modelView(model.id).record && modelView(model.id).status !== "unsupported").sort(bySizeAscending)[0];
}
