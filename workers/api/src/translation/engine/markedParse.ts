import { splitByMarker } from "./cueChunks";
import { repairCorruptMarkers } from "./markerRepair";

const NUMERIC_KEY_PATTERN = /^\d+(?:\.\d+)?$/;

export const UNIT_MARKER_PATTERN = /\u27e6u([^\u27e6\u27e7]+)\u27e7/gi;
export const GROUP_MARKER_PATTERN = /\u27e6t([^\u27e6\u27e7]+)\u27e7/gi;
export const unitMarker = (id: number | string): string => `\u27e6u${id}\u27e7`;
export const groupMarker = (id: number | string): string => `\u27e6t${id}\u27e7`;

export function parseMarked(
  flat: string, pattern: RegExp, prefix: string, expectedIds: readonly (string | number)[], restore: (piece: string) => string
): Map<string, string> {
  const chunks = splitByMarker(repairCorruptMarkers(flat, prefix, expectedIds), pattern, false);
  const parsed = new Map<string, string>();
  for (const [key, chunk] of chunks) if (NUMERIC_KEY_PATTERN.test(key.trim())) parsed.set(key.trim(), restore(chunk));
  return parsed;
}
