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
