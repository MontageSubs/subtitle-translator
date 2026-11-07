import { scriptOf } from "../../lib/subtitle/common/languageCodes";
import { createSegment, segmentsContinue } from "../../lib/subtitle/sentence/grouping";
import { sentenceRulesFor } from "../../lib/subtitle/sentence/rules";
import type { Cue } from "../../lib/subtitle/types";

const MAX_SCENE_LOOKBACK_CUES = 200;
const MAX_SENTENCE_LOOKBACK_CUES = 8;

const segmentOf = (cue: Cue) => createSegment(cue.id, cue.text, cue.start_ms, cue.end_ms, 0);

function sentenceStartIndex(cues: readonly Cue[], breakpoint: number, sourceLang: string): number {
  const rules = sentenceRulesFor(sourceLang);
  const floor = Math.max(0, breakpoint - MAX_SENTENCE_LOOKBACK_CUES);
  let start = breakpoint;
  let head = segmentOf(cues[breakpoint]!);
  while (start > floor) {
    const previous = segmentOf(cues[start - 1]!);
    if (!segmentsContinue(previous, head, rules)) break;
    head = previous;
    start--;
  }
  return start;
}

export function resumeCues(cues: readonly Cue[], isOutstanding: (cue: Cue) => boolean, sceneById: ReadonlyMap<number, number>, sourceLang: string): Cue[] {
  const breakpoint = cues.findIndex(isOutstanding);
  if (breakpoint < 0) return [];
  const scene = sceneById.get(cues[breakpoint]!.id);
  const sceneLookback: number[] = [];
  for (let index = 0; index < breakpoint; index++) if (sceneById.get(cues[index]!.id) === scene) sceneLookback.push(index);

  let lookback: ReadonlySet<number>;
  if (sceneLookback.length < MAX_SCENE_LOOKBACK_CUES) {
    lookback = new Set(sceneLookback);
  } else if (scriptOf(sourceLang) === "latin") {
    const start = sentenceStartIndex(cues, breakpoint, sourceLang);
    lookback = new Set(Array.from({ length: breakpoint - start }, (_, offset) => start + offset));
  } else {
    lookback = new Set();
  }
  return cues.filter((cue, index) => (index < breakpoint ? lookback.has(index) : isOutstanding(cue)));
}
