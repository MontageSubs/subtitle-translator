import { MUSIC_NOTE_PATTERN } from "../subtitle/common/charClass";
import { stripMarkup } from "../subtitle/common/markup";
import { splitDialogue } from "../subtitle/sentence/dialogue";
import { createSegment, groupSegments, type SentenceSegment } from "../subtitle/sentence/grouping";
import { sentenceRulesFor, type SentenceRules } from "../subtitle/sentence/rules";
import type { Cue } from "../subtitle/types";
import type { RecognitionProfile } from "./profile";

export interface RecognitionUnit {
  text: string;
  breaks: readonly number[];
}

const CONTENT_PATTERN = /[\p{L}\p{N}]/u;
const LINE_BREAK_PATTERN = /\n/;
const HORIZONTAL_SPACE_PATTERN = /[^\S\n]+/g;
const BLANK_LINE_PATTERN = /\n[^\S\n]*(?=\n)/g;
const EDGE_HASH_PATTERN = /^#+\s*|\s*#+$/g;
const LATIN_EDGE_PATTERN = /[\p{Script=Latin}\p{N}]/u;

function cueSegments(cue: Cue, rules: SentenceRules): SentenceSegment[] {
  const cleaned = stripMarkup(cue.text).replace(HORIZONTAL_SPACE_PATTERN, " ").replace(BLANK_LINE_PATTERN, "").trim();
  if (!cleaned) return [];
  return splitDialogue(cleaned)
    .map((piece) => rules.stripLetterStutter(piece.replace(EDGE_HASH_PATTERN, "").trim()))
    .filter((piece) => CONTENT_PATTERN.test(piece) && !MUSIC_NOTE_PATTERN.test(piece))
    .map((piece, dashIndex) => createSegment(cue.id, piece, cue.start_ms, cue.end_ms, dashIndex));
}

function joinPieces(pieces: readonly string[], profile: RecognitionProfile, breaks: number[], offset: number): string {
  let text = "";
  pieces.forEach((piece, index) => {
    if (index) {
      const separator = profile.spaced || (LATIN_EDGE_PATTERN.test(text.slice(-1)) && LATIN_EDGE_PATTERN.test(piece[0] ?? "")) ? " " : "";
      text += separator;
      if (!profile.spaced) breaks.push(offset + text.length);
    }
    text += piece;
  });
  return text;
}

function assemble(group: readonly SentenceSegment[], profile: RecognitionProfile): RecognitionUnit {
  const breaks: number[] = [];
  let text = "";
  group.forEach((segment, index) => {
    if (index) {
      text += profile.joiner;
      if (!profile.spaced) breaks.push(text.length);
    }
    text += joinPieces(segment.text.split(LINE_BREAK_PATTERN).map((piece) => piece.trim()).filter(Boolean), profile, breaks, text.length);
  });
  return { text, breaks };
}

export function buildRecognitionUnits(cueLists: readonly (readonly Cue[])[], sourceLang: string, profile: RecognitionProfile): RecognitionUnit[] {
  const rules = sentenceRulesFor(sourceLang);
  const fits = (group: readonly SentenceSegment[], next: SentenceSegment): boolean => group.reduce((total, { text }) => total + text.length, next.text.length) < profile.maxUnitChars;
  return cueLists.flatMap((cues) => {
    const segments = cues.flatMap((cue) => cueSegments(cue, rules));
    return groupSegments(segments, rules, fits).map((group) => assemble(group, profile));
  });
}
