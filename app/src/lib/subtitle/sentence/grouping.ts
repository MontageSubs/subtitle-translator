import { HEAD_CLOSER, TAIL_OPENER, classifyHead, classifyTail } from "./edges";
import { MAX_OVERLAP_MS, SCENE_ADJACENCY_MS } from "./timing";
import { updateQuoteState } from "./dialogue";
import type { SentenceRules } from "./rules";

const QUOTE_PENDING_LIMIT = 10;

export interface SentenceSegment {
  cueId: number;
  text: string;
  tail: number;
  head: number;
  startMs: number;
  endMs: number;
  dashIndex: number;
}

export const createSegment = (cueId: number, text: string, startMs: number, endMs: number, dashIndex: number): SentenceSegment => ({
  cueId,
  text,
  tail: classifyTail(text),
  head: classifyHead(text),
  startMs,
  endMs,
  dashIndex,
});

function continues(previous: SentenceSegment, current: SentenceSegment, rules: SentenceRules): boolean {
  if (previous.cueId === current.cueId) return rules.isShortReply(current.text);
  const gap = current.startMs - previous.endMs;
  if (gap < -MAX_OVERLAP_MS) return false;
  if (current.head & HEAD_CLOSER || previous.tail & TAIL_OPENER) return gap <= SCENE_ADJACENCY_MS;
  return rules.continuesSentence(previous, current, gap);
}

export function groupSegments(segments: readonly SentenceSegment[], rules: SentenceRules, fits: (group: readonly SentenceSegment[], next: SentenceSegment) => boolean): SentenceSegment[][] {
  const groups: SentenceSegment[][] = [];
  let current: SentenceSegment[] = [];
  let quotePending = false;
  let quoteSpan = 0;
  for (const segment of segments) {
    const last = current[current.length - 1];
    const quoteContinues = last !== undefined && quotePending && segment.startMs - last.endMs <= SCENE_ADJACENCY_MS;
    const joins = last !== undefined && fits(current, segment) && (quoteContinues || continues(last, segment, rules));
    if (!joins) {
      if (current.length) groups.push(current);
      current = [];
      quotePending = false;
      quoteSpan = 0;
    }
    current.push(segment);
    quotePending = updateQuoteState(segment.text, quotePending);
    quoteSpan = quotePending ? quoteSpan + 1 : 0;
    if (quoteSpan >= QUOTE_PENDING_LIMIT) quotePending = false;
  }
  if (current.length) groups.push(current);
  return groups;
}
