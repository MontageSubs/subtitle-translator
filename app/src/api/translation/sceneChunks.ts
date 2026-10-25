import type { Cue } from "../../lib/subtitle/types";

const MIN_CHUNK_RATIO = 0.5;

export function sceneAlignedChunks<T extends Pick<Cue, "id">>(cues: readonly T[], sceneById: ReadonlyMap<number, number>, maxCues: number): T[][] {
  const scenes = cues.map((cue) => sceneById.get(cue.id) ?? 0);
  const suffixMin = new Array<number>(cues.length + 1).fill(Infinity);
  for (let index = cues.length - 1; index >= 0; index--) suffixMin[index] = Math.min(scenes[index]!, suffixMin[index + 1]!);

  const chunks: T[][] = [];
  let start = 0;
  while (cues.length - start > maxCues) {
    const earliestEnd = start + Math.ceil(maxCues * MIN_CHUNK_RATIO);
    const latestEnd = start + maxCues;
    let precedingMax = -Infinity;
    let end = latestEnd;
    let found = false;
    for (let index = start; index <= latestEnd; index++) {
      if (index >= earliestEnd && precedingMax < suffixMin[index]!) {
        end = index;
        found = true;
      }
      if (index < cues.length) precedingMax = Math.max(precedingMax, scenes[index]!);
    }
    if (!found) end = latestEnd;
    chunks.push(cues.slice(start, end));
    start = end;
  }
  chunks.push(cues.slice(start));
  return chunks;
}
