import { MODEL_POINTER_NAME, descriptorNameOf, modelCatalogPath, modelDirectory } from "../src/config/assetLayout";
import { textEntry, type DeploymentEntry } from "../hosting/deployment";
import { descriptorOf, partEntries } from "../hosting/layout";
import type { SourceFiles } from "../hosting/localFile";
import type { ChannelManifest } from "./catalog";
import type { Ledger } from "./ledger";

export const blobDirectory = (id: string, revision: string): string => `blobs/${id}/${revision}`;

export interface ModelSite {
  entries: DeploymentEntry[];
  verifyPaths: string[];
}

const sizeOf = (model: Ledger["models"][string] | undefined): number | undefined => (model ? Object.values(model.files).reduce((sum, file) => sum + file.bytes, 0) : undefined);

export function channelCatalogDocument(ledger: Ledger, manifests: readonly ChannelManifest[]): string {
  const models = Object.fromEntries([...manifests].sort((left, right) => left.id.localeCompare(right.id)).map(({ id, manifest }) => {
    const mirrored = ledger.models[id];
    const bytes = sizeOf(mirrored);
    return [id, { manifest, ...(bytes ? { bytes } : {}), ...(mirrored?.meta ? { meta: mirrored.meta } : {}) }];
  }));
  return JSON.stringify({ schema: 1, models });
}

export function buildModelSite(ledger: Ledger, ledgerText: string, notFound: string, sources: SourceFiles, catalogDocuments: ReadonlyMap<string, string>): ModelSite {
  const entries: DeploymentEntry[] = [];
  const verifyPaths = ["index.json"];
  const directory: Record<string, unknown> = {};

  for (const [id, model] of Object.entries(ledger.models)) {
    const blobs = blobDirectory(id, model.revision);
    const partPrefix = `../../${blobs}/`;
    const pointerFiles: Record<string, unknown> = {};
    let totalBytes = 0;
    for (const [name, file] of Object.entries(model.files)) {
      totalBytes += file.bytes;
      const descriptor = descriptorOf(name, file, partPrefix);
      const parts = partEntries(blobs, name, file, (offset, length) => sources.range(`${id}/${name}`, file.sha256, offset, length));
      entries.push(...parts, textEntry(`${modelDirectory(id)}/${descriptorNameOf(name)}`, JSON.stringify(descriptor)));
      pointerFiles[name] = { bytes: file.bytes, sha256: file.sha256, descriptor: descriptorNameOf(name), parts: descriptor.parts };
      verifyPaths.push(`${modelDirectory(id)}/${descriptorNameOf(name)}`, parts[0]!.path);
    }
    const pointer = { schema: 1, id, revision: model.revision, updatedAt: model.updatedAt, bytes: totalBytes, ...(model.meta ? { meta: model.meta } : {}), files: pointerFiles };
    entries.push(textEntry(`${modelDirectory(id)}/${MODEL_POINTER_NAME}`, JSON.stringify(pointer)));
    verifyPaths.push(`${modelDirectory(id)}/${MODEL_POINTER_NAME}`);
    directory[id] = { revision: model.revision, updatedAt: model.updatedAt, bytes: totalBytes, pointer: `${modelDirectory(id)}/${MODEL_POINTER_NAME}` };
  }

  for (const [channel, document] of catalogDocuments) {
    entries.push(textEntry(modelCatalogPath(channel), document));
    verifyPaths.push(modelCatalogPath(channel));
  }
  entries.push(textEntry("index.json", JSON.stringify({ schema: 1, models: directory })), textEntry("registry.json", ledgerText), textEntry("404.html", notFound));
  return { entries, verifyPaths };
}
