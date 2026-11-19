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

export type IntakeItem =
  | { kind: "source"; relativePath: string; load(): Promise<RawSource | RejectedInput> }
  | { kind: "matroska"; pending: PendingMatroska }
  | { kind: "rejected"; input: RejectedInput };

export type IntakeStream = AsyncGenerator<IntakeItem, void, undefined>;

export interface ArchiveOutputFile {
  path: string;
  content: string;
}

const nameCollator = new Intl.Collator(undefined, { numeric: true });

const compareNames = (a: string, b: string): number => nameCollator.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0);

export function compareTreeOrder(a: string, b: string): number {
  const left = a.split(PATH_SEPARATOR);
  const right = b.split(PATH_SEPARATOR);
  const shared = Math.min(left.length, right.length);
  for (let level = 0; level < shared; level += 1) {
    if (left[level] === right[level]) continue;
    const leftIsFile = level === left.length - 1;
    const rightIsFile = level === right.length - 1;
    if (leftIsFile !== rightIsFile) return leftIsFile ? -1 : 1;
    return compareNames(left[level], right[level]);
  }
  return left.length - right.length;
}

const compareEntries = (a: FileSystemEntry, b: FileSystemEntry): number => (a.isFile === b.isFile ? compareNames(a.name, b.name) : a.isFile ? -1 : 1);

function pathDepth(relativePath: string): number {
  return relativePath.split(PATH_SEPARATOR).length - 1;
}

function baseName(relativePath: string): string {
  return relativePath.slice(relativePath.lastIndexOf(PATH_SEPARATOR) + 1);
}

const rejection = (name: string, reason: InputRejectionReason): IntakeItem => ({ kind: "rejected", input: { name, reason } });

async function* itemsOfZip(file: File, relativePath: string): IntakeStream {
  let zip: JSZip;
  try {
    zip = await (await loadJsZip()).loadAsync(await file.arrayBuffer());
  } catch {
    yield rejection(relativePath, "unreadable");
    return;
  }
  const entries = Object.values(zip.files)
    .map((entry) => ({ entry, path: entry.name.replace(/^\/+/, "") }))
    .filter(({ entry, path }) => !entry.dir && pathDepth(path) <= MAX_ARCHIVE_DEPTH && isSubtitleFilename(path))
    .sort((a, b) => compareTreeOrder(a.path, b.path));
  if (!entries.length) {
    yield rejection(relativePath, "empty");
    return;
  }
  for (const { entry, path } of entries) {
    yield {
      kind: "source",
      relativePath: path,
      load: async () => {
        try {
          return { name: baseName(path), relativePath: path, bytes: await entry.async("uint8array") };
        } catch {
          return { name: path, reason: "unreadable" };
        }
      },
    };
  }
}

const readBytes = async (file: File): Promise<Uint8Array> => new Uint8Array(await file.arrayBuffer());

const settle = <T>(promise: Promise<T>): Promise<T | null> => promise.catch(() => null);

async function* itemsOfFile(name: string, relativePath: string, explicit: boolean, getFile: () => Promise<File>): IntakeStream {
  if (isZipFilename(name) || isMatroskaFilename(name)) {
    const file = await settle(getFile());
    if (!file) yield rejection(relativePath, "unreadable");
    else if (isZipFilename(name)) yield* itemsOfZip(file, relativePath);
    else yield { kind: "matroska", pending: { file, relativePath } };
  } else if (isUnsupportedArchiveFilename(name)) {
    yield rejection(relativePath, "unsupported");
  } else if (isSubtitleFilename(name)) {
    yield { kind: "source", relativePath, load: async () => ({ name, relativePath, bytes: await readBytes(await getFile()) }) };
  } else if (explicit) {
    yield {
      kind: "source",
      relativePath,
      load: async () => {
        const file = await getFile();
        if (isUnsupportedMediaFilename(name) || !(await looksLikeText(file))) return { name: relativePath, reason: "unsupportedFile" };
        return { name, relativePath, bytes: await readBytes(file) };
      },
    };
  }
}

function readFileEntry(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

function readBatch(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => reader.readEntries(resolve, reject));
}

async function readDirectoryEntries(entry: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  const reader = entry.createReader();
  const all: FileSystemEntry[] = [];
  for (let batch = await readBatch(reader); batch.length; batch = await readBatch(reader)) all.push(...batch);
  return all;
}

async function* walkEntries(entries: FileSystemEntry[], parentPath: string, depth: number): IntakeStream {
  for (const entry of [...entries].sort(compareEntries)) {
    const relativePath = parentPath ? `${parentPath}${PATH_SEPARATOR}${entry.name}` : entry.name;
    if (entry.isFile) {
      yield* itemsOfFile(entry.name, relativePath, depth === 1, () => readFileEntry(entry as FileSystemFileEntry));
    } else if (entry.isDirectory && depth < MAX_ARCHIVE_DEPTH) {
      const children = await settle(readDirectoryEntries(entry as FileSystemDirectoryEntry));
      if (!children) {
        yield rejection(relativePath, "unreadable");
        continue;
      }
      let yielded = false;
      for await (const item of walkEntries(children, relativePath, depth + 1)) {
        yielded = true;
        yield item;
      }
      if (depth === 1 && !yielded) yield rejection(entry.name, "empty");
    }
  }
}

export async function* intakeOf(items: IntakeItem[]): IntakeStream {
  yield* items;
}

export async function* collectSourcesFromFiles(files: File[]): IntakeStream {
  for (const file of [...files].sort((a, b) => compareTreeOrder(a.name, b.name))) yield* itemsOfFile(file.name, file.name, true, async () => file);
}

export function collectSourcesFromDataTransfer(dataTransfer: DataTransfer): IntakeStream {
  const entries = Array.from(dataTransfer.items ?? [])
    .map((item) => (item.kind === "file" ? item.webkitGetAsEntry?.() ?? null : null))
    .filter((entry): entry is FileSystemEntry => entry !== null);
  if (entries.length) return walkEntries(entries, "", 1);
  const files = Array.from(dataTransfer.files ?? []);
  if (files.length || !dataTransfer.items?.length) return collectSourcesFromFiles(files);
  return intakeOf([rejection("", "notAFile")]);
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
