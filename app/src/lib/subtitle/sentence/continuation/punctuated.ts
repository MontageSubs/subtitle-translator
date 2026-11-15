import { HEAD_ELLIPSIS, HEAD_LOWER, HEAD_UPPER, TAIL_CONTINUATION, TAIL_DASH, TAIL_ELLIPSIS, TAIL_TERMINAL, type CueEdges } from "../edges";
import { GAP_THRESHOLD_MS, SCENE_ADJACENCY_MS } from "../timing";

const DOMAIN_LABEL_TAIL = /[\p{L}\p{N}-]\.$/u;
const TOP_LEVEL_DOMAIN_HEAD = /^(?:com|net|org|io|co|tv|me|app|dev|ai|edu|gov|info|biz|xyz|uk|cn|jp|de|fr|ru|us|ca|au|fm|ly|gg)(?![\p{L}\p{N}])/u;

const splitsDomainName = (previous: CueEdges, current: CueEdges): boolean =>
  (current.head & HEAD_LOWER) !== 0 && DOMAIN_LABEL_TAIL.test(previous.text.trimEnd()) && TOP_LEVEL_DOMAIN_HEAD.test(current.text.trimStart());

export function continuesByPunctuation(previous: CueEdges, current: CueEdges, gapMs: number): boolean {
  const { tail } = previous;
  const { head } = current;
  if (tail & TAIL_TERMINAL) return gapMs <= GAP_THRESHOLD_MS && splitsDomainName(previous, current);
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
