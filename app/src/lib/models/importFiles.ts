import { readArchive } from "./archive";
import type { ModelManifest } from "./types";

const ARCHIVE_PATTERN = /\.zip$/i;

const lastSegment = (path: string): string => path.split("/").pop() ?? path;

export async function collectImportBlobs(files: readonly File[], maxArchiveBytes: number): Promise<Map<string, Blob>> {
  const available = new Map<string, Blob>();
  for (const file of files) {
    if (!ARCHIVE_PATTERN.test(file.name)) {
      available.set(file.name, file);
      continue;
    }
    for (const [name, blob] of await readArchive(file, maxArchiveBytes)) available.set(name, blob);
  }
  return available;
}

export function matchManifestFiles(manifest: ModelManifest, available: ReadonlyMap<string, Blob>): { blobs: Map<string, Blob>; missing: string[] } {
  const blobs = new Map<string, Blob>();
  const missing: string[] = [];
  for (const file of manifest.files) {
    const blob = available.get(file.name) ?? available.get(lastSegment(file.path));
    if (blob) blobs.set(file.name, blob);
    else missing.push(file.name);
  }
  return { blobs, missing };
}
