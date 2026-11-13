import { RawBlock, readBlockElementAt, readHeaderAt, scanRange } from "./clusterScan";
import { parseCueIndex, CueIndex, CueReference } from "./cuesIndex";
import { CLUSTER_ID, CLUSTER_TIMECODE_ID, CUES_ID } from "./elementIds";
import { readUnsigned, UNKNOWN_SIZE } from "./ebml";
import { FileWindow } from "./fileWindow";
import type { MatroskaLayout } from "./layoutProbe";
import type { PauseGate } from "./pauseGate";

const MAX_CUES_BYTES = 64 * 1024 * 1024;
const MAX_TIMECODE_SEARCH_CHILDREN = 4;
const READ_LANES = 8;
const VERIFIED_CLUSTERS = 24;

interface ClusterOrigin {
  bodyStart: number;
  ticks: number;
}

type BlockMap = Map<number, RawBlock[]>;

async function readClusterOrigin(window: FileWindow, offset: number): Promise<ClusterOrigin | null> {
  const header = await readHeaderAt(window, offset);
  if (!header || header.id !== CLUSTER_ID) return null;
  const bodyStart = offset + header.headerLength;
  let position = bodyStart;
  for (let child = 0; child < MAX_TIMECODE_SEARCH_CHILDREN; child++) {
    const childHeader = await readHeaderAt(window, position);
    if (!childHeader || childHeader.size === UNKNOWN_SIZE) return null;
    const childStart = position + childHeader.headerLength;
    if (childHeader.id === CLUSTER_TIMECODE_ID) return { bodyStart, ticks: readUnsigned(await window.read(childStart, childHeader.size)) };
    position = childStart + childHeader.size;
  }
  return null;
}

async function readCueIndex(window: FileWindow, layout: MatroskaLayout, wanted: ReadonlySet<number>): Promise<CueIndex | null> {
  if (layout.cuesOffset === null) return null;
  const header = await readHeaderAt(window, layout.cuesOffset);
  if (!header || header.id !== CUES_ID || header.size === UNKNOWN_SIZE || header.size > MAX_CUES_BYTES) return null;
  return parseCueIndex((await window.read(layout.cuesOffset + header.headerLength, header.size)).slice(), wanted);
}

function groupByCluster(references: readonly CueReference[]): Map<number, CueReference[]> {
  const groups = new Map<number, CueReference[]>();
  for (const reference of references) {
    const group = groups.get(reference.clusterPosition);
    if (group) group.push(reference);
    else groups.set(reference.clusterPosition, [reference]);
  }
  return groups;
}

async function readClusterReferences(window: FileWindow, layout: MatroskaLayout, wanted: ReadonlySet<number>, clusterPosition: number, references: readonly CueReference[], blocks: BlockMap): Promise<boolean> {
  const offset = layout.segmentStart + clusterPosition;
  const origin = await readClusterOrigin(window, offset);
  if (!origin) return false;
  const context = { window, wantedTracks: wanted, nanosecondsPerTick: layout.nanosecondsPerTick };
  const visited = new Set<number>();
  for (const { relativePosition } of references) {
    if (visited.has(relativePosition)) continue;
    visited.add(relativePosition);
    if (!(await readBlockElementAt(context, origin.bodyStart + relativePosition, origin.ticks, blocks))) return false;
  }
  return true;
}

const countOf = (blocks: BlockMap): number => [...blocks.values()].reduce((sum, list) => sum + list.length, 0);

function spreadSample<T>(items: readonly T[], count: number): T[] {
  if (items.length <= count) return [...items];
  return Array.from({ length: count }, (_, index) => items[Math.floor((index * (items.length - 1)) / (count - 1))]);
}

async function clusterMatchesCues(window: FileWindow, layout: MatroskaLayout, wanted: ReadonlySet<number>, clusterPosition: number, references: readonly CueReference[], gate?: PauseGate): Promise<boolean> {
  const scanWindow = new FileWindow(window.source, gate);
  const scanned = await scanRange({ window: scanWindow, wantedTracks: wanted, nanosecondsPerTick: layout.nanosecondsPerTick }, { start: layout.segmentStart + clusterPosition, end: layout.segmentStart + clusterPosition + 1 });
  const expected = new Set(references.map(({ relativePosition }) => relativePosition)).size;
  return countOf(scanned.blocks) === expected;
}

async function cuesAreComplete(window: FileWindow, layout: MatroskaLayout, wanted: ReadonlySet<number>, index: CueIndex, grouped: Map<number, CueReference[]>, gate?: PauseGate): Promise<boolean> {
  const sample = spreadSample(index.clusterPositions, VERIFIED_CLUSTERS);
  const checks = sample.map((position) => clusterMatchesCues(window, layout, wanted, position, grouped.get(position) ?? [], gate));
  return (await Promise.all(checks)).every(Boolean);
}

export async function extractViaCues(source: Blob, layout: MatroskaLayout, wantedTracks: readonly number[], gate?: PauseGate): Promise<BlockMap | null> {
  if (!wantedTracks.length) return null;
  const wanted: ReadonlySet<number> = new Set(wantedTracks);
  const window = new FileWindow(source, gate);
  const index = await readCueIndex(window, layout, wanted);
  if (!index || index.hasUnpositionedWantedCue || !index.references.length) return null;
  const grouped = groupByCluster(index.references);
  if (!(await cuesAreComplete(window, layout, wanted, index, grouped, gate))) return null;

  const queue = [...grouped];
  const blocks: BlockMap = new Map();
  let intact = true;
  const lane = async (): Promise<void> => {
    const laneWindow = new FileWindow(source, gate);
    for (let entry = queue.shift(); entry && intact; entry = queue.shift()) {
      intact = await readClusterReferences(laneWindow, layout, wanted, entry[0], entry[1], blocks);
    }
  };
  await Promise.all(Array.from({ length: Math.min(READ_LANES, queue.length) }, lane));
  if (!intact) return null;
  for (const list of blocks.values()) list.sort((a, b) => a.startMs - b.startMs);
  return blocks;
}
