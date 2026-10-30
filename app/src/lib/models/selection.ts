import { modelsOfKind } from "./catalog";
import { modelView } from "./manager";
import type { ModelKind, ModelManifest } from "./types";

const bySizeAscending = (left: ModelManifest, right: ModelManifest): number => left.sizeHint - right.sizeHint;

export function selectModel(kind: ModelKind, language: string, applies: (model: ModelManifest) => boolean = () => true): ModelManifest | undefined {
  const candidates = modelsOfKind(kind).filter((model) => model.languages.includes(language) && applies(model));
  const withView = (predicate: (view: ReturnType<typeof modelView>) => boolean): ModelManifest[] => candidates.filter((model) => predicate(modelView(model.id)));
  const ready = withView((view) => view.status === "installed" && view.record?.enabled === true);
  if (ready.length) return ready.sort(bySizeAscending).at(-1);
  const disabled = withView((view) => view.status === "installed");
  if (disabled.length) return disabled.sort(bySizeAscending).at(-1);
  return withView((view) => !view.record && view.status !== "unsupported").filter((model) => !model.deprecated).sort(bySizeAscending)[0];
}
