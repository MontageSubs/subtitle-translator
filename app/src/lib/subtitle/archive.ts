import JSZip from "jszip";
import { isSubtitleFilename, isUnsupportedArchiveFilename, isZipFilename } from "./formats/extensions";

const MAX_ARCHIVE_DEPTH = 10;
const PATH_SEPARATOR = "/";

export interface RawSource {
  name: string;
  relativePath: string;
  bytes: Uint8Array;
}

export interface CollectResult {
  sources: RawSource[];
  rejectedArchives: string[];
}

export interface ArchiveOutputFile {
  path: string;
  content: string;
}

function emptyResult(): CollectResult {
  return { sources: [], rejectedArchives: [] };
}

function pathDepth(relativePath: string): number {
  return relativePath.split(PATH_SEPARATOR).length - 1;
}

function baseName(relativePath: string): string {
  return relativePath.slice(relativePath.lastIndexOf(PATH_SEPARATOR) + 1);
}

async function extractZipEntries(file: File): Promise<RawSource[]> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const sources: RawSource[] = [];
  for (const entry of Object.values(zip.files)) {
    const relativePath = entry.name.replace(/^\/+/, "");
    if (entry.dir || pathDepth(relativePath) > MAX_ARCHIVE_DEPTH || !isSubtitleFilename(relativePath)) continue;
    sources.push({ name: baseName(relativePath), relativePath, bytes: await entry.async("uint8array") });
  }
  return sources;
}

async function ingestFile(file: File, relativePath: string, acceptUnknown: boolean, result: CollectResult): Promise<void> {
  if (isZipFilename(file.name)) {
    result.sources.push(...await extractZipEntries(file));
  } else if (isUnsupportedArchiveFilename(file.name)) {
    result.rejectedArchives.push(relativePath);
  } else if (acceptUnknown || isSubtitleFilename(file.name)) {
    result.sources.push({ name: file.name, relativePath, bytes: new Uint8Array(await file.arrayBuffer()) });
  }
}

function readFileEntry(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

async function readDirectoryEntries(entry: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  const reader = entry.createReader();
  const all: FileSystemEntry[] = [];
  for (let batch = await readBatch(reader); batch.length; batch = await readBatch(reader)) all.push(...batch);
  return all;
}

function readBatch(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => reader.readEntries(resolve, reject));
}

async function walkEntry(entry: FileSystemEntry, relativePath: string, depth: number, result: CollectResult): Promise<void> {
  if (entry.isFile) {
    await ingestFile(await readFileEntry(entry as FileSystemFileEntry), relativePath, depth === 1, result);
  } else if (entry.isDirectory && depth < MAX_ARCHIVE_DEPTH) {
    for (const child of await readDirectoryEntries(entry as FileSystemDirectoryEntry)) {
      await walkEntry(child, `${relativePath}${PATH_SEPARATOR}${child.name}`, depth + 1, result);
    }
  }
}

export async function collectSourcesFromFiles(files: File[]): Promise<CollectResult> {
  const result = emptyResult();
  for (const file of files) await ingestFile(file, file.name, true, result);
  return result;
}

export async function collectSourcesFromDataTransfer(dataTransfer: DataTransfer): Promise<CollectResult> {
  const entries = Array.from(dataTransfer.items ?? [])
    .map((item) => (item.kind === "file" ? item.webkitGetAsEntry?.() ?? null : null))
    .filter((entry): entry is FileSystemEntry => entry !== null);
  if (!entries.length) return collectSourcesFromFiles(Array.from(dataTransfer.files ?? []));

  const result = emptyResult();
  for (const entry of entries) await walkEntry(entry, entry.name, 1, result);
  return result;
}

export function withDirectoryOf(relativePath: string | undefined, filename: string): string {
  if (!relativePath?.includes(PATH_SEPARATOR)) return filename;
  return relativePath.slice(0, relativePath.lastIndexOf(PATH_SEPARATOR) + 1) + filename;
}

export async function buildOutputZip(files: ArchiveOutputFile[]): Promise<Blob> {
  const zip = new JSZip();
  for (const file of files) zip.file(file.path, file.content);
  return zip.generateAsync({ type: "blob" });
}
