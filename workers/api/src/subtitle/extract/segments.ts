import type { Cue, StyleWrap } from "../types";
import type { SourceRules } from "../languages/types";
import type { CompiledGlossary } from "./glossary";
import { findPureGlossaryLine, findStutterResolution } from "./glossary";
import { splitDialogue } from "./dialogue";
import { splitFullWrap } from "./styleTags";
import { isMusicText } from "../common/charClass";
import { hasContentChars } from "../contentChars";
import { musicContinuation } from "./music";
import { HEAD_CLOSER, TAIL_OPENER, classifyHead, classifyTail } from "./edges";
import { MAX_OVERLAP_MS, SCENE_ADJACENCY_MS } from "./timing";

export interface Segment {
  cue_id: number;
  text: string;
  tail: number;
  head: number;
  music: boolean;
  start_ms: number;
  end_ms: number;
  resolved: string | null;
  dash_index: number;
  style_wrap: StyleWrap | null;
  marker_boundary?: boolean;
  merge_side?: "next" | "prev";
}

export type MergeReason = "dash" | "gap" | "music" | "marker";

function assignMergeSides(segments: Segment[], rules: SourceRules, isolatedMergeMaxWords: number): void {
  if (!isolatedMergeMaxWords) return;
  segments.forEach((segment, i) => {
    if (segment.resolved !== null || segment.music || !rules.isIsolatedShort(segment.text, isolatedMergeMaxWords)) return;
    const next = segments[i + 1];
    if (next && !next.music && next.start_ms - segment.end_ms <= SCENE_ADJACENCY_MS) {
      segment.merge_side = "next";
      return;
    }
    const previous = segments[i - 1];
    if (previous && !previous.music && segment.start_ms - previous.end_ms <= SCENE_ADJACENCY_MS) {
      segment.merge_side = "prev";
    }
  });
}

export function mergeReason(previous: Segment, current: Segment, rules: SourceRules): MergeReason | null {
  if (previous.music !== current.music) return null;
  if (previous.cue_id === current.cue_id) return rules.isShortReply(current.text) ? "dash" : null;
  if (current.music) return musicContinuation(current.text) ? "music" : null;
  if (previous.merge_side === "next" || current.merge_side === "prev") return "marker";
  const gap = current.start_ms - previous.end_ms;
  if (gap < -MAX_OVERLAP_MS) return null;
  if (current.head & HEAD_CLOSER || previous.tail & TAIL_OPENER) return gap <= SCENE_ADJACENCY_MS ? "gap" : null;
  return rules.continuesSentence(previous, current, gap) ? "gap" : null;
}

function resolveSegment(text: string, glossary: CompiledGlossary, rules: SourceRules): string | null {
  if (!hasContentChars(text)) return text;
  return findPureGlossaryLine(text, glossary, rules) || (rules.resolvesGlossaryStutter ? findStutterResolution(text, glossary) : null);
}

export function buildSegments(cues: Cue[], glossary: CompiledGlossary, rules: SourceRules, isolatedMergeMaxWords: number): Segment[] {
  const segments: Segment[] = [];
  for (const cue of cues) {
    const { text: body, styleWrap: cueWrap } = splitFullWrap(cue.text);
    const parts = splitDialogue(body);
    parts.forEach((part, dashIndex) => {
      const { text, styleWrap } = cueWrap || parts.length === 1 ? { text: part, styleWrap: cueWrap } : splitFullWrap(part);
      const resolved = resolveSegment(text, glossary, rules);
      const segmentText = resolved !== null ? text : rules.stripLetterStutter(text);
      segments.push({
        cue_id: cue.id,
        text: segmentText,
        tail: classifyTail(segmentText),
        head: classifyHead(segmentText),
        music: isMusicText(segmentText),
        start_ms: cue.start_ms,
        end_ms: cue.end_ms,
        resolved,
        dash_index: dashIndex,
        style_wrap: styleWrap,
      });
    });
  }
  assignMergeSides(segments, rules, isolatedMergeMaxWords);
  return segments;
}
