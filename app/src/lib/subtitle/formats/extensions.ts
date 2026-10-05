import { SubtitleFormat } from '../../../utils/types';

const FORMAT_BY_EXTENSION: Record<string, SubtitleFormat> = { srt: "srt", vtt: "vtt", ass: "ass", ssa: "ass" };
const UNSUPPORTED_ARCHIVE_EXTENSIONS = new Set(["rar", "7z", "tar", "gz", "tgz", "bz2", "xz", "iso"]);

export const ACCEPTED_EXTENSIONS = [...Object.keys(FORMAT_BY_EXTENSION), "zip"].map((extension) => `.${extension}`);

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

export function detectFormat(filename: string): SubtitleFormat {
  return FORMAT_BY_EXTENSION[extensionOf(filename)] ?? "srt";
}

export function isSubtitleFilename(name: string): boolean {
  return extensionOf(name) in FORMAT_BY_EXTENSION;
}

export function isZipFilename(name: string): boolean {
  return extensionOf(name) === "zip";
}

export function isUnsupportedArchiveFilename(name: string): boolean {
  return UNSUPPORTED_ARCHIVE_EXTENSIONS.has(extensionOf(name));
}
