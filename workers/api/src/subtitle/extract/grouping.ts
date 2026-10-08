import type { SourceRules } from "../languages/types";
import { SCENE_ADJACENCY_MS, mergeReason, type Segment } from "./segments";
import { updateQuoteState } from "./dialogue";

const QUOTE_PENDING_LIMIT = 10;

export function groupSegments(segments: Segment[], rules: SourceRules): Segment[][] {
  const groups: Segment[][] = [];
  let current: Segment[] = [];
  let quotePending = false;
  let quoteSpan = 0;

  const startGroup = (first: Segment) => {
    if (current.length) groups.push(current);
    current = [first];
    quotePending = false;
    quoteSpan = 0;
  };

  for (const segment of segments) {
    if (segment.resolved) {
      if (current.length) groups.push(current);
      groups.push([segment]);
      current = [];
      quotePending = false;
      quoteSpan = 0;
      continue;
    }

    const last = current[current.length - 1];
    let merged = false;
    if (last) {
      merged = quotePending && segment.start_ms - last.end_ms <= SCENE_ADJACENCY_MS;
      if (!merged) {
        const reason = mergeReason(last, segment, rules);
        if (reason) {
          merged = true;
          if (reason === "marker" || reason === "dash") segment.marker_boundary = true;
        }
      }
    }

    if (merged) current.push(segment);
    else startGroup(segment);

    quotePending = updateQuoteState(segment.text, quotePending);
    quoteSpan = quotePending ? quoteSpan + 1 : 0;
    if (quoteSpan >= QUOTE_PENDING_LIMIT) {
      quotePending = false;
    }
  }
  if (current.length) groups.push(current);
  return groups;
}
