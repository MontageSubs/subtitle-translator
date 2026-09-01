import JSZip from "jszip";

const SUBTITLE_EXTENSIONS = ["ass", "ssa", "srt", "vtt"];
const UNSUPPORTED_ARCHIVE_EXTENSIONS = ["rar", "7z", "tar", "gz", "tgz", "bz2", "xz", "iso"];
const MAX_ARCHIVE_DEPTH = 10;

export interface RawSource {
  name: string;
  relativePath: string;
  bytes: Uint8Array;
}

export interface CollectResult {
  sources: RawSource[];
  rejectedArchives: string[];
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

function isSubtitleFilename(name: string): boolean {
  return SUBTITLE_EXTENSIONS.includes(extensionOf(name));
}

function isZipFilename(name: string): boolean {
  return extensionOf(name) === "zip";
}

function isUnsupportedArchiveFilename(name: string): boolean {
  return UNSUPPORTED_ARCHIVE_EXTENSIONS.includes(extensionOf(name));
}

function pathDepth(relativePath: string): number {
  return relativePath.split("/").length - 1;
}

async function extractZipEntries(file: File): Promise<RawSource[]> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const sources: RawSource[] = [];
  const entries = Object.values(zip.files) as JSZip.JSZipObject[];
  for (const entry of entries) {
    if (entry.dir) continue;
    const relativePath = entry.name.replace(/^\/+/, "");
    if (pathDepth(relativePath) > MAX_ARCHIVE_DEPTH) continue;
    if (!isSubtitleFilename(relativePath)) continue;
    const bytes = await entry.async("uint8array");
    sources.push({ name: relativePath.split("/").pop()!, relativePath, bytes });
  }
  return sources;
}

async function readFileEntry(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

async function readDirectoryEntries(entry: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  const reader = entry.createReader();
  const all: FileSystemEntry[] = [];
  for (;;) {
    const batch: FileSystemEntry[] = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
    if (!batch.length) break;
    all.push(...batch);
  }
  return all;
}

async function walkEntry(entry: FileSystemEntry, relativePath: string, depth: number, result: CollectResult): Promise<void> {
  if (entry.isFile) {
    const file = await readFileEntry(entry as FileSystemFileEntry);
    if (isZipFilename(entry.name)) {
      result.sources.push(...await extractZipEntries(file));
    } else if (isUnsupportedArchiveFilename(entry.name)) {
      result.rejectedArchives.push(relativePath);
    } else if (isSubtitleFilename(entry.name)) {
      result.sources.push({ name: entry.name, relativePath, bytes: new Uint8Array(await file.arrayBuffer()) });
    }
    return;
  }
  if (entry.isDirectory && depth < MAX_ARCHIVE_DEPTH) {
    const children = await readDirectoryEntries(entry as FileSystemDirectoryEntry);
    for (const child of children) {
      await walkEntry(child, `${relativePath}/${child.name}`, depth + 1, result);
    }
  }
}

export async function collectSourcesFromFiles(files: File[]): Promise<CollectResult> {
  const result: CollectResult = { sources: [], rejectedArchives: [] };
  for (const file of files) {
    if (isZipFilename(file.name)) {
      result.sources.push(...await extractZipEntries(file));
    } else if (isUnsupportedArchiveFilename(file.name)) {
      result.rejectedArchives.push(file.name);
    } else {
      result.sources.push({ name: file.name, relativePath: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
    }
  }
  return result;
}

export async function collectSourcesFromDataTransfer(dataTransfer: DataTransfer): Promise<CollectResult> {
  const items = Array.from(dataTransfer.items || []);
  const entries = items
    .map((item) => (item.kind === "file" && item.webkitGetAsEntry ? item.webkitGetAsEntry() : null))
    .filter((entry): entry is FileSystemEntry => entry !== null);

  if (!entries.length) {
    return collectSourcesFromFiles(Array.from(dataTransfer.files || []));
  }

  const result: CollectResult = { sources: [], rejectedArchives: [] };
  for (const entry of entries) {
    await walkEntry(entry, entry.name, 1, result);
  }
  return result;
}

export function withDirectoryOf(relativePath: string | undefined, filename: string): string {
  if (!relativePath || !relativePath.includes("/")) return filename;
  return relativePath.slice(0, relativePath.lastIndexOf("/") + 1) + filename;
}

export interface ArchiveOutputFile {
  path: string;
  content: string;
}

export async function buildOutputZip(files: ArchiveOutputFile[]): Promise<Blob> {
  const zip = new JSZip();
  for (const file of files) zip.file(file.path, file.content);
  return zip.generateAsync({ type: "blob" });
}
