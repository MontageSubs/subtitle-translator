import { stripMarkup } from "../../subtitle/common/markup";
import type { Cue } from "../../subtitle/types";
import type { RecognitionProfile } from "../profile";

const LABEL_PATTERN = /^[-\u2013\u2014\s]*(?:\[([^\]\n]{1,30})\]|\(([^)\n]{1,30})\)|([^\n:\uff1a[\](){}<>]{1,30}?))\s*[:\uff1a]/;
const WORD_PATTERN = /[\p{L}][\p{L}\p{M}'\u2019-]*/gu;
const MAX_LABEL_WORDS = 3;
const MIN_WORD_LENGTH = 2;
const SHOUTED_TEST = /^[^\p{Ll}]*\p{Lu}[^\p{Ll}]*$/u;

function labelOf(line: string): string | null {
  const match = LABEL_PATTERN.exec(line);
  if (!match) return null;
  const bracketed = match[1] ?? match[2];
  const label = (bracketed ?? match[3] ?? "").trim();
  return bracketed !== undefined || SHOUTED_TEST.test(label) ? label : null;
}

export function extractSpeakerHints(cueLists: readonly (readonly Cue[])[], profile: RecognitionProfile): Set<string> {
  const hints = new Set<string>();
  if (!profile.spaced) return hints;
  for (const cues of cueLists) {
    for (const cue of cues) {
      for (const line of stripMarkup(cue.text).split("\n")) {
        const label = labelOf(line);
        const words = label?.match(WORD_PATTERN);
        if (!words || words.length > MAX_LABEL_WORDS) continue;
        for (const word of words) if (word.length >= MIN_WORD_LENGTH) hints.add(word.normalize("NFKC").toLowerCase());
      }
    }
  }
  return hints;
}
