import { modelsOfKind } from "./catalog";
import { modelView } from "./manager";
import type { ModelKind, ModelManifest } from "./types";

const bySizeAscending = (left: ModelManifest, right: ModelManifest): number => left.sizeHint - right.sizeHint;

export function selectModel(kind: ModelKind, language: string): ModelManifest | undefined {
  const candidates = modelsOfKind(kind).filter((model) => model.languages.includes(language));
  const ready = candidates.filter((model) => {
    const view = modelView(model.id);
    return view.status === "installed" && view.record?.enabled === true;
  });
  if (ready.length) return ready.sort(bySizeAscending).at(-1);
  const installable = candidates.filter((model) => {
    const view = modelView(model.id);
    return !model.deprecated && !view.record && view.status !== "unsupported";
  });
  return installable.sort(bySizeAscending)[0];
}
