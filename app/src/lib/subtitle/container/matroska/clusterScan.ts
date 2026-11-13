import {
  BLOCK_DURATION_ID, BLOCK_GROUP_ID, BLOCK_ID, CLUSTER_ID, CLUSTER_TIMECODE_ID, LEVEL_ONE_IDS, SIMPLE_BLOCK_ID,
} from "./elementIds";
import { ElementHeader, MAX_ELEMENT_HEADER_BYTES, readElementHeader, readSigned16, readUnsigned, readVint, UNKNOWN_SIZE } from "./ebml";
import type { FileWindow } from "./fileWindow";

export interface ByteRange {
  start: number;
  end: number;
}

export interface RawBlock {
  startMs: number;
  durationMs: number | null;
  data: Uint8Array;
}

export interface RangeScan {
  blocks: Map<number, RawBlock[]>;
  endOffset: number;
}

export interface ScanContext {
  window: FileWindow;
  wantedTracks: ReadonlySet<number>;
  nanosecondsPerTick: number;
  onAdvance?: (scannedBytes: number) => void;
}

const BLOCK_HEAD_BYTES = 12;
const LACING_MASK = 0x06;
const NANOSECONDS_PER_MILLISECOND = 1_000_000;

export async function readHeaderAt(window: FileWindow, offset: number): Promise<ElementHeader | null> {
  return readElementHeader(await window.read(offset, MAX_ELEMENT_HEADER_BYTES), 0);
}

const ticksToMs = (ticks: number, context: ScanContext): number => (ticks * context.nanosecondsPerTick) / NANOSECONDS_PER_MILLISECOND;

async function readBlock(context: ScanContext, bodyStart: number, size: number, clusterTicks: number, blocks: Map<number, RawBlock[]>): Promise<RawBlock | null> {
  const head = await context.window.read(bodyStart, Math.min(size, BLOCK_HEAD_BYTES));
  const track = readVint(head, 0);
  if (!track || !context.wantedTracks.has(track.value)) return null;
  const flagsOffset = track.length + 2;
  if (flagsOffset >= head.length || head[flagsOffset] & LACING_MASK) return null;
  const payloadStart = bodyStart + flagsOffset + 1;
  const payloadLength = size - flagsOffset - 1;
  if (payloadLength <= 0) return null;
  const block: RawBlock = {
    startMs: Math.round(ticksToMs(clusterTicks + readSigned16(head, track.length), context)),
    durationMs: null,
    data: (await context.window.read(payloadStart, payloadLength)).slice(),
  };
  const list = blocks.get(track.value);
  if (list) list.push(block);
  else blocks.set(track.value, [block]);
  return block;
}

export async function readBlockElementAt(context: ScanContext, offset: number, clusterTicks: number, blocks: Map<number, RawBlock[]>): Promise<boolean> {
  const header = await readHeaderAt(context.window, offset);
  if (!header || header.size === UNKNOWN_SIZE) return false;
  const bodyStart = offset + header.headerLength;
  if (header.id === SIMPLE_BLOCK_ID) await readBlock(context, bodyStart, header.size, clusterTicks, blocks);
  else if (header.id === BLOCK_GROUP_ID) await scanBlockGroup(context, bodyStart, bodyStart + header.size, clusterTicks, blocks);
  else return false;
  return true;
}

async function scanBlockGroup(context: ScanContext, bodyStart: number, bodyEnd: number, clusterTicks: number, blocks: Map<number, RawBlock[]>): Promise<void> {
  let position = bodyStart;
  let block: RawBlock | null = null;
  while (position < bodyEnd) {
    const header = await readHeaderAt(context.window, position);
    if (!header || header.size === UNKNOWN_SIZE) return;
    const childStart = position + header.headerLength;
    if (header.id === BLOCK_ID) block = await readBlock(context, childStart, header.size, clusterTicks, blocks);
    else if (header.id === BLOCK_DURATION_ID && block) {
      block.durationMs = Math.round(ticksToMs(readUnsigned(await context.window.read(childStart, header.size)), context));
    }
    position = childStart + header.size;
  }
}

async function scanCluster(context: ScanContext, bodyStart: number, size: number, blocks: Map<number, RawBlock[]>): Promise<number> {
  const limit = size === UNKNOWN_SIZE ? context.window.size : Math.min(context.window.size, bodyStart + size);
  let position = bodyStart;
  let clusterTicks = 0;
  while (position < limit) {
    const header = await readHeaderAt(context.window, position);
    if (!header) return limit;
    if (size === UNKNOWN_SIZE && LEVEL_ONE_IDS.has(header.id)) return position;
    if (header.size === UNKNOWN_SIZE) return limit;
    const childStart = position + header.headerLength;
    const childEnd = childStart + header.size;
    if (header.id === CLUSTER_TIMECODE_ID) clusterTicks = readUnsigned(await context.window.read(childStart, header.size));
    else if (header.id === SIMPLE_BLOCK_ID) await readBlock(context, childStart, header.size, clusterTicks, blocks);
    else if (header.id === BLOCK_GROUP_ID) await scanBlockGroup(context, childStart, Math.min(childEnd, limit), clusterTicks, blocks);
    position = childEnd;
  }
  return Math.min(position, limit);
}

export async function scanRange(context: ScanContext, range: ByteRange): Promise<RangeScan> {
  const blocks = new Map<number, RawBlock[]>();
  let position = range.start;
  while (position < range.end) {
    const header = await readHeaderAt(context.window, position);
    if (!header) break;
    const bodyStart = position + header.headerLength;
    if (header.id === CLUSTER_ID) position = await scanCluster(context, bodyStart, header.size, blocks);
    else if (header.size === UNKNOWN_SIZE) break;
    else position = Math.min(context.window.size, bodyStart + header.size);
    context.onAdvance?.(Math.min(position, range.end) - range.start);
  }
  return { blocks, endOffset: position };
}
