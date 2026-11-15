import { childElements, readUnsigned } from "./ebml";

export const CUE_POINT_ID = 0xbb;
export const CUE_TRACK_POSITIONS_ID = 0xb7;
export const CUE_TRACK_ID = 0xf7;
export const CUE_CLUSTER_POSITION_ID = 0xf1;
export const CUE_RELATIVE_POSITION_ID = 0xf0;

export interface CueReference {
  track: number;
  clusterPosition: number;
  relativePosition: number;
}

export interface CueIndex {
  references: CueReference[];
  clusterPositions: number[];
  hasUnpositionedWantedCue: boolean;
}

export function parseCueIndex(body: Uint8Array, wantedTracks: ReadonlySet<number>): CueIndex {
  const references: CueReference[] = [];
  const clusterPositions = new Set<number>();
  let hasUnpositionedWantedCue = false;
  for (const point of childElements(body)) {
    if (point.id !== CUE_POINT_ID) continue;
    const pointBody = body.subarray(point.start, point.end);
    for (const positions of childElements(pointBody)) {
      if (positions.id !== CUE_TRACK_POSITIONS_ID) continue;
      const positionsBody = pointBody.subarray(positions.start, positions.end);
      let track = 0;
      let clusterPosition: number | null = null;
      let relativePosition: number | null = null;
      for (const field of childElements(positionsBody)) {
        const value = readUnsigned(positionsBody.subarray(field.start, field.end));
        if (field.id === CUE_TRACK_ID) track = value;
        else if (field.id === CUE_CLUSTER_POSITION_ID) clusterPosition = value;
        else if (field.id === CUE_RELATIVE_POSITION_ID) relativePosition = value;
      }
      if (clusterPosition === null) continue;
      clusterPositions.add(clusterPosition);
      if (!wantedTracks.has(track)) continue;
      if (relativePosition === null) hasUnpositionedWantedCue = true;
      else references.push({ track, clusterPosition, relativePosition });
    }
  }
  return { references, clusterPositions: [...clusterPositions].sort((a, b) => a - b), hasUnpositionedWantedCue };
}
