import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isUpstreamFileUrl } from "../src/config/assetLayout";
import { isAssetSegment } from "../src/config/runtimeAssets";

export interface MirrorFileTarget {
  name: string;
  source: string;
  sha256: string | null;
}

export interface MirrorTarget {
  id: string;
  files: MirrorFileTarget[];
}

interface CatalogManifest {
  id?: string;
  delivery?: string;
  mirror?: boolean;
  files?: Array<{ name?: string; urls?: string[]; sha256?: string }>;
}

function targetOf(manifest: CatalogManifest): MirrorTarget | null {
  if (manifest.delivery !== "fetch" || manifest.mirror === false || !manifest.id || !isAssetSegment(manifest.id)) return null;
  const files = (manifest.files ?? []).flatMap(({ name, urls, sha256 }): MirrorFileTarget[] => {
    const source = urls?.find(isUpstreamFileUrl);
    return name && source && isAssetSegment(name) ? [{ name, source, sha256: sha256?.toLowerCase() ?? null }] : [];
  });
  return files.length > 0 ? { id: manifest.id, files } : null;
}

export interface CatalogSource {
  channel: string;
  directory: string;
}

export interface ChannelManifest {
  id: string;
  manifest: Record<string, unknown>;
}

function manifestsIn(directory: string): CatalogManifest[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).filter((name) => name.endsWith(".json")).sort().map((file) => JSON.parse(readFileSync(join(directory, file), "utf8")) as CatalogManifest);
}

export function readChannelManifests(sources: CatalogSource[]): Map<string, ChannelManifest[]> {
  const channels = new Map<string, ChannelManifest[]>();
  for (const { channel, directory } of sources) {
    const manifests = manifestsIn(directory).filter((manifest): manifest is CatalogManifest & { id: string } => typeof manifest.id === "string" && isAssetSegment(manifest.id));
    channels.set(channel, manifests.map((manifest) => ({ id: manifest.id, manifest: manifest as unknown as Record<string, unknown> })));
  }
  return channels;
}

export function readMirrorTargets(sources: CatalogSource[]): MirrorTarget[] {
  const byId = new Map<string, MirrorTarget>();
  for (const { directory } of sources) for (const manifest of manifestsIn(directory)) {
    const target = targetOf(manifest);
    if (target) byId.set(target.id, target);
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}
