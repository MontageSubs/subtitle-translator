import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isPartsDescriptorUrl } from "../src/config/assetLayout";
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
  files?: Array<{ name?: string; urls?: string[]; sha256?: string }>;
}

const isUpstreamUrl = (url: string): boolean => url.startsWith("https://") && !isPartsDescriptorUrl(url);

function targetOf(manifest: CatalogManifest): MirrorTarget | null {
  if (manifest.delivery !== "fetch" || !manifest.id || !isAssetSegment(manifest.id)) return null;
  const files = (manifest.files ?? []).flatMap(({ name, urls, sha256 }): MirrorFileTarget[] => {
    const source = urls?.find(isUpstreamUrl);
    return name && source && isAssetSegment(name) ? [{ name, source, sha256: sha256?.toLowerCase() ?? null }] : [];
  });
  return files.length > 0 ? { id: manifest.id, files } : null;
}

export function readMirrorTargets(catalogDirectories: string[]): MirrorTarget[] {
  const byId = new Map<string, Map<string, MirrorFileTarget>>();
  for (const directory of catalogDirectories.filter(existsSync)) {
    for (const file of readdirSync(directory).filter((name) => name.endsWith(".json"))) {
      const target = targetOf(JSON.parse(readFileSync(join(directory, file), "utf8")) as CatalogManifest);
      if (!target) continue;
      const files = byId.get(target.id) ?? new Map<string, MirrorFileTarget>();
      for (const entry of target.files) {
        const known = files.get(entry.name);
        if (known && (known.source !== entry.source || known.sha256 !== entry.sha256)) throw new Error(`${target.id}/${entry.name} is declared differently by two catalogs`);
        files.set(entry.name, entry);
      }
      byId.set(target.id, files);
    }
  }
  return [...byId].map(([id, files]) => ({ id, files: [...files.values()] })).sort((a, b) => a.id.localeCompare(b.id));
}
