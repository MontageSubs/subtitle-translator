import { hasTranslatableContent } from "../common/untranslated";
import { TAIL_TERMINAL, classifyTail } from "../sentence/edges";
import type { Cue, TranslatedCue } from "../types";
import { joinCueLines } from "./styleWraps";

type PassthroughFlags = Pick<TranslatedCue, "is_music" | "verbatim">;

export function passThroughCue({ id, start_ms, end_ms, text }: Cue, flags: PassthroughFlags = {}): TranslatedCue {
  const verbatimText = joinCueLines(text);
  return { id, start_ms, end_ms, text: verbatimText, translation: verbatimText, is_music: false, ...flags };
}

export function passThroughCues(cues: readonly Cue[], flags: PassthroughFlags = {}): TranslatedCue[] {
  return cues.map((cue) => passThroughCue(cue, flags));
}

export function selectRequestCues<T extends Pick<Cue, "text">>(cues: readonly T[]): T[] {
  const selected: T[] = [];
  let barriers: T[] = [];
  let sentenceOpen = false;
  for (const cue of cues) {
    if (!hasTranslatableContent(cue.text)) {
      if (sentenceOpen) barriers.push(cue);
      continue;
    }
    selected.push(...barriers, cue);
    barriers = [];
    sentenceOpen = (classifyTail(cue.text) & TAIL_TERMINAL) === 0;
  }
  return selected;
}
