import type { TimelineEvent } from "./timelineEvents";

export interface EventPair {
  earlier: TimelineEvent;
  later: TimelineEvent;
}

export interface PairingResult {
  pairs: EventPair[];
  unpaired: TimelineEvent[];
}

const MIN_OVERLAP_RATIO = 0.6;
const MAX_CANDIDATES = 12;

function overlapRatio(a: TimelineEvent, b: TimelineEvent): number {
  const shared = Math.min(a.end_ms, b.end_ms) - Math.max(a.start_ms, b.start_ms);
  const span = Math.max(a.end_ms, b.end_ms) - Math.min(a.start_ms, b.start_ms);
  return span > 0 ? shared / span : 0;
}

export function pairByTimeline(events: readonly TimelineEvent[]): PairingResult {
  const matched = new Set<number>();
  const pairs: EventPair[] = [];
  const unpaired: TimelineEvent[] = [];
  for (let index = 0; index < events.length; index++) {
    if (matched.has(index)) continue;
    const event = events[index];
    let bestIndex = -1;
    let bestRatio = MIN_OVERLAP_RATIO;
    for (let candidate = index + 1; candidate < events.length && candidate - index <= MAX_CANDIDATES && events[candidate].start_ms < event.end_ms; candidate++) {
      if (matched.has(candidate) || events[candidate].text === event.text) continue;
      const ratio = overlapRatio(event, events[candidate]);
      if (ratio > bestRatio || (ratio === bestRatio && bestIndex < 0)) {
        bestRatio = ratio;
        bestIndex = candidate;
      }
    }
    if (bestIndex < 0) {
      unpaired.push(event);
      continue;
    }
    matched.add(bestIndex);
    pairs.push({ earlier: event, later: events[bestIndex] });
  }
  return { pairs, unpaired };
}
