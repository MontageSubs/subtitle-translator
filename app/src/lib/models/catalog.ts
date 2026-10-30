import { DEFAULT_LOCALE } from "../../i18n/locales.config";
import { getLocale } from "../../i18n";
import type { ModelKind, ModelManifest } from "./types";

const bundled = import.meta.glob<ModelManifest>("../../model-catalog/*.json", { eager: true, import: "default" });

export const MODEL_CATALOG: readonly ModelManifest[] = Object.values(bundled).sort((left, right) => left.name.localeCompare(right.name));

export const findModel = (id: string): ModelManifest | undefined => MODEL_CATALOG.find((model) => model.id === id);

export const modelsOfKind = (kind: ModelKind): readonly ModelManifest[] => MODEL_CATALOG.filter((model) => model.kind === kind);

export const modelAnchor = (model: ModelManifest): string => model.id;

export const findModelByAnchor = (anchor: string): ModelManifest | undefined => MODEL_CATALOG.find((model) => modelAnchor(model) === anchor.toLowerCase());

export function modelDescription({ description }: ModelManifest): string {
  const locale = getLocale();
  return description[locale] ?? description[locale.split("-")[0]] ?? description[DEFAULT_LOCALE];
}
