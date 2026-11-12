import {
  ATTACHMENTS_ID, CHAPTERS_ID, CLUSTER_CHILD_IDS, CLUSTER_ID, CRC32_ID, CUES_ID, SEEK_HEAD_ID, TAGS_ID, VOID_ID,
} from "./elementIds";
import { UNKNOWN_SIZE } from "./ebml";
import { ByteRange, readHeaderAt } from "./clusterScan";
import type { MatroskaLayout } from "./layoutProbe";
import type { FileWindow } from "./fileWindow";

const CLUSTER_ID_BYTES = [0x1f, 0x43, 0xb6, 0x75];
const SEARCH_CHUNK_BYTES = 4 * 1024 * 1024;
const MAX_SEARCH_BYTES = 256 * 1024 * 1024;
const MIN_PARALLEL_SPAN_BYTES = 192 * 1024 * 1024;
const MIN_RANGE_BYTES = 48 * 1024 * 1024;

const AFTER_CLUSTER_IDS: ReadonlySet<number> = new Set([CLUSTER_ID, CUES_ID, TAGS_ID, ATTACHMENTS_ID, CHAPTERS_ID, SEEK_HEAD_ID, VOID_ID, CRC32_ID]);

async function isClusterStart(window: FileWindow, offset: number, limit: number): Promise<boolean> {
  const header = await readHeaderAt(window, offset);
  if (!header || header.id !== CLUSTER_ID || header.size === UNKNOWN_SIZE) return false;
  const bodyStart = offset + header.headerLength;
  const bodyEnd = bodyStart + header.size;
  if (bodyEnd > limit) return false;
  const first = await readHeaderAt(window, bodyStart);
  if (!first || first.size === UNKNOWN_SIZE || !CLUSTER_CHILD_IDS.has(first.id) || bodyStart + first.headerLength + first.size > bodyEnd) return false;
  if (bodyEnd === limit) return true;
  const next = await readHeaderAt(window, bodyEnd);
  return next !== null && AFTER_CLUSTER_IDS.has(next.id);
}

async function findClusterStart(window: FileWindow, from: number, limit: number): Promise<number | null> {
  let cursor = from;
  while (cursor < limit && cursor - from < MAX_SEARCH_BYTES) {
    const chunk = await window.read(cursor, SEARCH_CHUNK_BYTES);
    if (chunk.length < CLUSTER_ID_BYTES.length) return null;
    const lastStart = chunk.length - CLUSTER_ID_BYTES.length;
    for (let index = chunk.indexOf(CLUSTER_ID_BYTES[0]); index !== -1 && index <= lastStart; index = chunk.indexOf(CLUSTER_ID_BYTES[0], index + 1)) {
      if (CLUSTER_ID_BYTES.every((byte, step) => chunk[index + step] === byte) && await isClusterStart(window, cursor + index, limit)) return cursor + index;
    }
    cursor += lastStart + 1;
  }
  return null;
}

export async function planRanges(window: FileWindow, layout: MatroskaLayout, desiredRanges: number): Promise<ByteRange[]> {
  const { clusterStart, segmentEnd } = layout;
  const span = segmentEnd - clusterStart;
  const whole: ByteRange[] = [{ start: clusterStart, end: segmentEnd }];
  if (!layout.clustersHaveKnownSize || span < MIN_PARALLEL_SPAN_BYTES || desiredRanges < 2) return whole;
  const count = Math.min(desiredRanges, Math.floor(span / MIN_RANGE_BYTES));
  const boundaries = [clusterStart];
  for (let index = 1; index < count; index++) {
    const found = await findClusterStart(window, clusterStart + Math.floor((span * index) / count), segmentEnd);
    if (found !== null && found > boundaries[boundaries.length - 1]) boundaries.push(found);
  }
  boundaries.push(segmentEnd);
  return boundaries.slice(0, -1).map((start, index) => ({ start, end: boundaries[index + 1] }));
}
