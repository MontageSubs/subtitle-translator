import { HEAD_ELLIPSIS, HEAD_LOWER, HEAD_UPPER, TAIL_CONTINUATION, TAIL_DASH, TAIL_ELLIPSIS, TAIL_TERMINAL, type CueEdges } from "../edges";
import { GAP_THRESHOLD_MS, SCENE_ADJACENCY_MS } from "../timing";

export function continuesByPunctuation(previous: CueEdges, current: CueEdges, gapMs: number): boolean {
  const { tail } = previous;
  const { head } = current;
  if (tail & TAIL_TERMINAL) return false;
  const contiguous = gapMs <= GAP_THRESHOLD_MS;
  if (tail & TAIL_DASH) return contiguous && (head & HEAD_LOWER) !== 0;
  if (tail & TAIL_ELLIPSIS) {
    if (head & HEAD_ELLIPSIS) return gapMs <= SCENE_ADJACENCY_MS;
    if (head & HEAD_UPPER) return false;
  } else if (tail & TAIL_CONTINUATION && gapMs <= SCENE_ADJACENCY_MS) {
    return true;
  }
  return contiguous || (head & HEAD_LOWER) !== 0;
}
