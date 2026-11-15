import { cueStyleName } from "../formats/ass/template";
import type { Cue } from "../types";

export interface TimelineEvent {
  start_ms: number;
  end_ms: number;
  text: string;
  style: string;
  cues: Cue[];
}

const MERGE_GAP_MS = 120;

export function buildTimelineEvents(cues: readonly Cue[]): TimelineEvent[] {
  const ordered = [...cues].sort((a, b) => a.start_ms - b.start_ms);
  const open = new Map<string, TimelineEvent>();
  const events: TimelineEvent[] = [];
  for (const cue of ordered) {
    const style = cueStyleName(cue.cueSettings);
    const key = `${style}\u0000${cue.text}`;
    const previous = open.get(key);
    if (previous && cue.start_ms - previous.end_ms <= MERGE_GAP_MS) {
      previous.cues.push(cue);
      previous.end_ms = Math.max(previous.end_ms, cue.end_ms);
      continue;
    }
    const event: TimelineEvent = { start_ms: cue.start_ms, end_ms: cue.end_ms, text: cue.text, style, cues: [cue] };
    open.set(key, event);
    events.push(event);
  }
  return events;
}
