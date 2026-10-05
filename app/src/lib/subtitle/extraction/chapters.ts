export const DEFAULT_SCENE_CHANGE_SECONDS = 30;

export interface TimedSpan {
  start_ms: number;
  end_ms: number;
}

export function sceneIndexes(spans: TimedSpan[], sceneChangeMs: number): number[] {
  const indexes: number[] = [];
  let scene = 1;
  let threadEnd = spans[0]?.end_ms ?? 0;
  spans.forEach((span, position) => {
    if (position > 0) {
      if (span.start_ms - threadEnd > sceneChangeMs) scene += 1;
      threadEnd = Math.max(threadEnd, span.end_ms);
    }
    indexes.push(scene);
  });
  return indexes;
}

export function previewChapterCount(spans: TimedSpan[], sceneChangeMs: number): number {
  return sceneIndexes(spans, sceneChangeMs).pop() ?? 0;
}
