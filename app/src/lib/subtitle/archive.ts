import type JSZip from "jszip";
import { isMatroskaFilename, isSubtitleFilename, isUnsupportedArchiveFilename, isUnsupportedMediaFilename, isZipFilename } from "./formats/extensions";
import { looksLikeText } from "./extraction/textSniff";
import type { SourceChoice } from "./variants/types";

const loadJsZip = async (): Promise<typeof JSZip> => (await import("jszip")).default;

const MAX_ARCHIVE_DEPTH = 10;
const PATH_SEPARATOR = "/";

export interface RawSource {
  name: string;
  relativePath: string;
  bytes: Uint8Array;
  choice?: SourceChoice;
}

export type InputRejectionReason = "unsupported" | "unsupportedFile" | "notAFile" | "empty" | "unreadable" | "videoUnreadable" | "noSupportedSubtitle";

export interface PendingMatroska {
  file: File;
  relativePath: string;
}

export interface RejectedInput {
  name: string;
  reason: InputRejectionReason;
  retry?: PendingMatroska;
}

export interface CollectResult {
  sources: RawSource[];
  rejectedInputs: RejectedInput[];
  matroskaFiles: PendingMatroska[];
}

export interface ArchiveOutputFile {
  path: string;
  content: string;
}

function emptyResult(): CollectResult {
  return { sources: [], rejectedInputs: [], matroskaFiles: [] };
}

const collectedCount = (result: CollectResult): number => result.sources.length + result.rejectedInputs.length + result.matroskaFiles.length;

function pathDepth(relativePath: string): number {
  return relativePath.split(PATH_SEPARATOR).length - 1;
}

function baseName(relativePath: string): string {
  return relativePath.slice(relativePath.lastIndexOf(PATH_SEPARATOR) + 1);
}

async function extractZipEntries(file: File): Promise<RawSource[]> {
  const zip = await (await loadJsZip()).loadAsync(await file.arrayBuffer());
  const sources: RawSource[] = [];
  for (const entry of Object.values(zip.files)) {
    const relativePath = entry.name.replace(/^\/+/, "");
    if (entry.dir || pathDepth(relativePath) > MAX_ARCHIVE_DEPTH || !isSubtitleFilename(relativePath)) continue;
    sources.push({ name: baseName(relativePath), relativePath, bytes: await entry.async("uint8array") });
  }
  return sources;
}

async function ingestZip(file: File, relativePath: string, result: CollectResult): Promise<void> {
  try {
    const sources = await extractZipEntries(file);
    if (sources.length) result.sources.push(...sources);
    else result.rejectedInputs.push({ name: relativePath, reason: "empty" });
  } catch {
    result.rejectedInputs.push({ name: relativePath, reason: "unreadable" });
  }
}

async function ingestOtherFile(file: File, relativePath: string, explicit: boolean, result: CollectResult): Promise<void> {
  if (isSubtitleFilename(file.name)) {
    result.sources.push({ name: file.name, relativePath, bytes: new Uint8Array(await file.arrayBuffer()) });
    return;
  }
  if (!explicit) return;
  if (isUnsupportedMediaFilename(file.name) || !(await looksLikeText(file))) {
    result.rejectedInputs.push({ name: relativePath, reason: "unsupportedFile" });
    return;
  }
  result.sources.push({ name: file.name, relativePath, bytes: new Uint8Array(await file.arrayBuffer()) });
}

async function ingestFile(file: File, relativePath: string, explicit: boolean, result: CollectResult): Promise<void> {
  if (isZipFilename(file.name)) {
    await ingestZip(file, relativePath, result);
  } else if (isUnsupportedArchiveFilename(file.name)) {
    result.rejectedInputs.push({ name: relativePath, reason: "unsupported" });
  } else if (isMatroskaFilename(file.name)) {
    result.matroskaFiles.push({ file, relativePath });
  } else {
    await ingestOtherFile(file, relativePath, explicit, result);
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
  if (!entries.length) {
    const files = Array.from(dataTransfer.files ?? []);
    if (files.length || !dataTransfer.items?.length) return collectSourcesFromFiles(files);
    return { ...emptyResult(), rejectedInputs: [{ name: "", reason: "notAFile" }] };
  }

  const result = emptyResult();
  for (const entry of entries) {
    const collected = collectedCount(result);
    await walkEntry(entry, entry.name, 1, result);
    if (entry.isDirectory && collectedCount(result) === collected) {
      result.rejectedInputs.push({ name: entry.name, reason: "empty" });
    }
  }
  return result;
}

export function withDirectoryOf(relativePath: string | undefined, filename: string): string {
  if (!relativePath?.includes(PATH_SEPARATOR)) return filename;
  return relativePath.slice(0, relativePath.lastIndexOf(PATH_SEPARATOR) + 1) + filename;
}

const ZIP_COMPRESSION = { compression: "DEFLATE", compressionOptions: { level: 9 } } as const;

export async function compressToZip(entries: { path: string; content: string | Blob }[]): Promise<Blob> {
  const zip = new (await loadJsZip())();
  for (const entry of entries) zip.file(entry.path, entry.content);
  return zip.generateAsync({ type: "blob", ...ZIP_COMPRESSION });
}

export async function readFirstZipEntry(file: Blob): Promise<string> {
  const zip = await (await loadJsZip()).loadAsync(file);
  const [entry] = zip.file(/.*/);
  if (!entry) throw new Error("Empty archive");
  return entry.async("string");
}

export const buildOutputZip = (files: ArchiveOutputFile[]): Promise<Blob> => compressToZip(files);
