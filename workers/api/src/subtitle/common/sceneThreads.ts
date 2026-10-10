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
