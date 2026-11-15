import {
  CLUSTER_ID, CUES_ID, EBML_HEADER_ID, INFO_ID, SEEK_HEAD_ID, SEGMENT_ID, TAGS_ID, TRACKS_ID,
} from "./elementIds";
import { DEFAULT_TIMECODE_SCALE } from "./trackCodecs";
import { UNKNOWN_SIZE } from "./ebml";
import { readHeaderAt } from "./clusterScan";
import type { FileWindow } from "./fileWindow";
import { emptySeekTargets, MatroskaAudioTrack, MatroskaTrack, mergeSeekTargets, parseAudioTracks, parseSeekTargets, parseSubtitleTracks, parseTimecodeScale, SeekTargets } from "./tracks";

export interface MatroskaLayout {
  tracks: MatroskaTrack[];
  audioTracks: MatroskaAudioTrack[];
  nanosecondsPerTick: number;
  clusterStart: number;
  segmentStart: number;
  cuesOffset: number | null;
  tagsOffset: number | null;
  segmentEnd: number;
  clustersHaveKnownSize: boolean;
}

const MAX_METADATA_BYTES = 32 * 1024 * 1024;
const MAX_SEEK_HEAD_HOPS = 4;

async function readBody(window: FileWindow, offset: number, size: number): Promise<Uint8Array | null> {
  if (size > MAX_METADATA_BYTES) return null;
  return (await window.read(offset, size)).slice();
}

async function readSeekedMetadata(window: FileWindow, segmentStart: number, position: number | null, expectedId: number): Promise<Uint8Array | null> {
  if (position === null) return null;
  const offset = segmentStart + position;
  const header = await readHeaderAt(window, offset);
  if (!header || header.id !== expectedId || header.size === UNKNOWN_SIZE) return null;
  return readBody(window, offset + header.headerLength, header.size);
}

async function followSeekHeads(window: FileWindow, segmentStart: number, initial: SeekTargets): Promise<SeekTargets> {
  let merged = initial;
  const visited = new Set<number>();
  for (let hop = 0; hop < MAX_SEEK_HEAD_HOPS; hop++) {
    const next = merged.seekHeads.find((position) => !visited.has(position));
    if (next === undefined) break;
    visited.add(next);
    const body = await readSeekedMetadata(window, segmentStart, next, SEEK_HEAD_ID);
    if (body) merged = mergeSeekTargets(merged, parseSeekTargets(body));
  }
  return merged;
}

export async function probeLayout(window: FileWindow): Promise<MatroskaLayout | null> {
  const ebml = await readHeaderAt(window, 0);
  if (!ebml || ebml.id !== EBML_HEADER_ID || ebml.size === UNKNOWN_SIZE) return null;
  const segmentOffset = ebml.headerLength + ebml.size;
  const segment = await readHeaderAt(window, segmentOffset);
  if (!segment || segment.id !== SEGMENT_ID) return null;
  const segmentStart = segmentOffset + segment.headerLength;
  const segmentEnd = segment.size === UNKNOWN_SIZE ? window.size : Math.min(window.size, segmentStart + segment.size);

  let tracksBody: Uint8Array | null = null;
  let infoBody: Uint8Array | null = null;
  let seekTargets: SeekTargets = emptySeekTargets();
  let cuesOffset: number | null = null;
  let tagsOffset: number | null = null;
  let clusterStart = segmentEnd;
  let clustersHaveKnownSize = true;
  let position = segmentStart;
  while (position < segmentEnd) {
    const header = await readHeaderAt(window, position);
    if (!header) break;
    if (header.id === CLUSTER_ID) {
      clusterStart = position;
      clustersHaveKnownSize = header.size !== UNKNOWN_SIZE;
      break;
    }
    if (header.size === UNKNOWN_SIZE) break;
    const bodyStart = position + header.headerLength;
    if (header.id === TRACKS_ID) tracksBody = await readBody(window, bodyStart, header.size);
    else if (header.id === CUES_ID) cuesOffset = position;
    else if (header.id === TAGS_ID) tagsOffset = position;
    else if (header.id === INFO_ID) infoBody = await readBody(window, bodyStart, header.size);
    else if (header.id === SEEK_HEAD_ID) {
      const body = await readBody(window, bodyStart, header.size);
      if (body) seekTargets = mergeSeekTargets(seekTargets, parseSeekTargets(body));
    }
    position = bodyStart + header.size;
  }

  seekTargets = await followSeekHeads(window, segmentStart, seekTargets);
  tracksBody ??= await readSeekedMetadata(window, segmentStart, seekTargets.tracks, TRACKS_ID);
  infoBody ??= await readSeekedMetadata(window, segmentStart, seekTargets.info, INFO_ID);
  if (!tracksBody) return null;
  return {
    tracks: parseSubtitleTracks(tracksBody),
    audioTracks: parseAudioTracks(tracksBody),
    nanosecondsPerTick: infoBody ? parseTimecodeScale(infoBody) : DEFAULT_TIMECODE_SCALE,
    clusterStart,
    segmentStart,
    cuesOffset: cuesOffset ?? (seekTargets.cues === null ? null : segmentStart + seekTargets.cues),
    tagsOffset: tagsOffset ?? (seekTargets.tags === null ? null : segmentStart + seekTargets.tags),
    segmentEnd,
    clustersHaveKnownSize,
  };
}
