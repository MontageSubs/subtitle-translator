import { DEFAULT_LOCALE } from "../../i18n/locales.config";
import { getLocale } from "../../i18n";
import type { ModelKind, ModelManifest, ModelOverlay } from "./types";

const bundled = Object.values(import.meta.glob<ModelManifest>("../../model-catalog/*.json", { eager: true, import: "default" })).sort((left, right) => left.name.localeCompare(right.name));

let overlays: ReadonlyMap<string, ModelOverlay> = new Map();
let merged: readonly ModelManifest[] | null = null;

function withOverlay(manifest: ModelManifest): ModelManifest {
  const overlay = overlays.get(manifest.id);
  if (!overlay) return manifest;
  return { ...manifest, author: overlay.author ?? manifest.author, homepage: overlay.homepage ?? manifest.homepage, license: overlay.license, bytes: overlay.bytes };
}

export function modelCatalog(): readonly ModelManifest[] {
  merged ??= bundled.map(withOverlay);
  return merged;
}

export function applyModelOverlays(next: ReadonlyMap<string, ModelOverlay>): void {
  overlays = next;
  merged = null;
}

export const bundledModelIds = (): readonly string[] => bundled.map(({ id }) => id);

export const findModel = (id: string): ModelManifest | undefined => modelCatalog().find((model) => model.id === id);

export const modelsOfKind = (kind: ModelKind): readonly ModelManifest[] => modelCatalog().filter((model) => model.kind === kind);

export const modelAnchor = (model: ModelManifest): string => model.id;

export const findModelByAnchor = (anchor: string): ModelManifest | undefined => modelCatalog().find((model) => modelAnchor(model) === anchor.toLowerCase());

export function modelDescription({ description }: ModelManifest): string {
  const locale = getLocale();
  return description[locale] ?? description[locale.split("-")[0]] ?? description[DEFAULT_LOCALE];
}
