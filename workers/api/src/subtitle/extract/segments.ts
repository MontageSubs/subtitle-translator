import type { Cue, StyleWrap } from "../types";
import type { SourceRules } from "../languages/types";
import type { CompiledGlossaryTerm } from "./glossary";
import { findPureGlossaryLine, findStutterResolution } from "./glossary";
import { splitDialogue } from "./dialogue";
import { splitFullWrap } from "./styleTags";
import { firstLetterIsLower } from "./letterCase";
import { isMusicSegment, musicContinuation } from "./music";
import { TRAILING_SINGLE_CUTOFF_PATTERN, hasTerminalPunct } from "./terminal";

export const GAP_THRESHOLD_MS = 200;
export const SCENE_ADJACENCY_MS = 1500;

export interface Segment {
  cue_id: number;
  text: string;
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
    if (segment.resolved || isMusicSegment(segment.text) || !rules.isIsolatedShort(segment.text, isolatedMergeMaxWords)) return;
    const next = segments[i + 1];
    if (next && !isMusicSegment(next.text) && next.start_ms - segment.end_ms <= SCENE_ADJACENCY_MS) {
      segment.merge_side = "next";
      return;
    }
    const previous = segments[i - 1];
    if (previous && !isMusicSegment(previous.text) && segment.start_ms - previous.end_ms <= SCENE_ADJACENCY_MS) {
      segment.merge_side = "prev";
    }
  });
}

export function mergeReason(previous: Segment, current: Segment, rules: SourceRules): MergeReason | null {
  const previousIsMusic = isMusicSegment(previous.text);
  const currentIsMusic = isMusicSegment(current.text);
  if (previousIsMusic !== currentIsMusic) return null;
  if (previous.cue_id === current.cue_id) return rules.isShortReply(current.text) ? "dash" : null;
  if (previousIsMusic && currentIsMusic) return musicContinuation(current.text) ? "music" : null;
  if (previous.merge_side === "next" || current.merge_side === "prev") return "marker";
  const gap = current.start_ms - previous.end_ms;
  if (TRAILING_SINGLE_CUTOFF_PATTERN.test(previous.text) && !(gap <= GAP_THRESHOLD_MS && firstLetterIsLower(current.text))) return null;
  if (hasTerminalPunct(previous.text)) return null;
  return gap <= GAP_THRESHOLD_MS || firstLetterIsLower(current.text) ? "gap" : null;
}

export function buildSegments(cues: Cue[], glossary: CompiledGlossaryTerm[], rules: SourceRules, isolatedMergeMaxWords: number): Segment[] {
  const segments: Segment[] = [];
  for (const cue of cues) {
    const { text: workingText, styleWrap } = splitFullWrap(cue.text);
    splitDialogue(workingText).forEach((part, dashIndex) => {
      let resolved = findPureGlossaryLine(part, glossary, rules);
      if (!resolved && rules.resolvesGlossaryStutter) resolved = findStutterResolution(part, glossary);
      segments.push({
        cue_id: cue.id,
        text: resolved ? part : rules.stripLetterStutter(part),
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
