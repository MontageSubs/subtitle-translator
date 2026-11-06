import { DEFAULT_LOCALE } from "../../i18n/locales.config";
import { getLocale } from "../../i18n";
import type { ModelKind, ModelManifest, ModelUpdate } from "./types";

const bundled = Object.values(import.meta.glob<ModelManifest>("../../model-catalog/*.json", { eager: true, import: "default" })).sort((left, right) => left.name.localeCompare(right.name));

let updates: ReadonlyMap<string, ModelUpdate> = new Map();
let merged: readonly ModelManifest[] | null = null;

const isNewerOrSame = (candidate: string, baseline: string): boolean => candidate.localeCompare(baseline, undefined, { numeric: true }) >= 0;

function withUpdate(manifest: ModelManifest): ModelManifest {
  const update = updates.get(manifest.id);
  if (!update || !isNewerOrSame(update.manifest.version, manifest.version)) return manifest;
  const { meta } = update;
  return { ...update.manifest, author: meta?.author ?? update.manifest.author, homepage: meta?.homepage ?? update.manifest.homepage, license: meta?.license ?? update.manifest.license, bytes: update.bytes ?? update.manifest.bytes };
}

export function modelCatalog(): readonly ModelManifest[] {
  merged ??= bundled.map(withUpdate);
  return merged;
}

export function applyModelUpdates(next: ReadonlyMap<string, ModelUpdate>): void {
  updates = next;
  merged = null;
}

export const bundledModelIds = (): ReadonlySet<string> => new Set(bundled.map(({ id }) => id));

export const findModel = (id: string): ModelManifest | undefined => modelCatalog().find((model) => model.id === id);

export const modelsOfKind = (kind: ModelKind): readonly ModelManifest[] => modelCatalog().filter((model) => model.kind === kind);

export const modelAnchor = (model: ModelManifest): string => model.id;

export const findModelByAnchor = (anchor: string): ModelManifest | undefined => modelCatalog().find((model) => modelAnchor(model) === anchor.toLowerCase());

export function modelDescription({ description }: ModelManifest): string {
  const locale = getLocale();
  return description[locale] ?? description[locale.split("-")[0]] ?? description[DEFAULT_LOCALE];
}
