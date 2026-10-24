import { isMusicText } from "./charClass";
import type { Cue } from "../types";

export const DEFAULT_SCENE_CHANGE_SECONDS = 30;

export type SceneKind = "music" | "dialogue";

export interface SceneProbe {
  kind: SceneKind;
  start_ms: number;
  end_ms: number;
}

export function sceneIndexes<T>(items: readonly T[], sceneChangeMs: number, probe: (item: T) => SceneProbe): number[] {
  const threadScene: Partial<Record<SceneKind, number>> = {};
  const threadEnd: Partial<Record<SceneKind, number>> = {};
  let sceneCount = 0;
  return items.map((item) => {
    const { kind, start_ms, end_ms } = probe(item);
    if (threadScene[kind] === undefined || start_ms - threadEnd[kind]! > sceneChangeMs) threadScene[kind] = sceneCount++;
    threadEnd[kind] = end_ms;
    return threadScene[kind]!;
  });
}

function cueSceneIndexes(cues: readonly Cue[], sceneSeconds: number): number[] {
  return sceneIndexes(cues, sceneSeconds * 1000, (cue): SceneProbe => ({ ...cue, kind: isMusicText(cue.text) ? "music" : "dialogue" }));
}

export function countScenes(cues: readonly Cue[], sceneSeconds: number): number {
  return cueSceneIndexes(cues, sceneSeconds).reduce((max, scene) => Math.max(max, scene + 1), 0);
}

export function splitAtSceneBoundaries<T extends Cue>(cues: readonly T[], sceneSeconds: number, maxSize: number): T[][] {
  const scenes = cueSceneIndexes(cues, sceneSeconds);
  const followingMin = new Array<number>(scenes.length + 1).fill(Infinity);
  for (let index = scenes.length - 1; index >= 0; index--) followingMin[index] = Math.min(scenes[index], followingMin[index + 1]);

  const batches: T[][] = [];
  let start = 0;
  while (cues.length - start > maxSize) {
    let end = start + maxSize;
    let precedingMax = -1;
    let cut = 0;
    for (let index = start; index < end; index++) {
      precedingMax = Math.max(precedingMax, scenes[index]);
      if (followingMin[index + 1] > precedingMax) cut = index + 1;
    }
    end = cut || end;
    batches.push(cues.slice(start, end));
    start = end;
  }
  batches.push(cues.slice(start));
  return batches;
}
