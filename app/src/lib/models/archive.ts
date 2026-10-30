const MAX_EXPANSION_FACTOR = 3;

export class ArchiveError extends Error {}

export async function readArchive(file: File, maxBytes: number): Promise<Map<string, Blob>> {
  const { default: JSZip } = await import("jszip");
  const archive = await JSZip.loadAsync(file).catch(() => {
    throw new ArchiveError("unreadable");
  });
  const files = new Map<string, Blob>();
  let total = 0;
  for (const entry of Object.values(archive.files)) {
    const name = entry.name.split("/").pop() ?? "";
    if (entry.dir || !name || entry.name.startsWith("__MACOSX/") || name.startsWith(".")) continue;
    const blob = await entry.async("blob");
    total += blob.size;
    if (total > maxBytes * MAX_EXPANSION_FACTOR) throw new ArchiveError("oversized");
    files.set(name, blob);
  }
  return files;
}

export async function writeArchive(files: ReadonlyMap<string, Blob>): Promise<Blob> {
  const { default: JSZip } = await import("jszip");
  const archive = new JSZip();
  files.forEach((blob, name) => archive.file(name, blob, { compression: "STORE" }));
  return archive.generateAsync({ type: "blob" });
}
