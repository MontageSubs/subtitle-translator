import type { Cue } from "../types";
import { ELLIPSIS_PATTERN, NO_LINE_END_CHARS, NO_LINE_START_CHARS } from "./characters";
import { fixMusicSpacing } from "./music";
import { STYLE_TAG_PATTERN, stripStyling } from "../common/markup";
import { foldWhitespace } from "../common/whitespace";

const DASH_ARTIFACT_PATTERN = /—+|-{2,}/g;
const BRACKET_CHAR_PATTERN = /[()（）\[\]【】{}]/;
const BRACKET_CONTENT_PATTERN = /[(（\[【{][^()（）\[\]【】{}]*[)）\]】}]/g;
export const LONE_LEADING_DASH_PATTERN = /^(?:\s|<\/?[ibu]>)*-(?!-)/i;
const DASH_STYLE_SAMPLE_LIMIT = 9;
const MARKER_ONLY_STYLE_PAIR_PATTERN = /<(i|b|u)>[\s\p{P}\p{S}]*<\/\1>/giu;
const WHITESPACE_PATTERN = /\s/;
const FINAL_MARKS = ".!?…।॥";
const FINAL_CLOSERS = "'\"”’»)]";
const CLOSING_TAG_LENGTH = 4;
const CLOSING_TAGS: ReadonlySet<string> = new Set(["</i>", "</b>", "</u>"]);

function enforceLineEdges(text: string): string {
  while (text && NO_LINE_START_CHARS.has(text[0]!)) text = text.slice(1).trimStart();
  while (text && NO_LINE_END_CHARS.has(text[text.length - 1]!)) text = text.slice(0, -1).trimEnd();
  return text;
}

function spaceAfterEllipsis(matched: string, offset: number, full: string): string {
  const end = offset + matched.length;
  return end === full.length || WHITESPACE_PATTERN.test(full[end]!) || NO_LINE_START_CHARS.has(full[end]!) ? "..." : "... ";
}

export function normalizeTranslation(text: string, defersPunctuationStyle: boolean): string {
  if (text.includes("—") || text.includes("--")) text = text.replace(DASH_ARTIFACT_PATTERN, "...");
  if (!defersPunctuationStyle && (text.includes("..") || text.includes("…"))) text = text.replace(ELLIPSIS_PATTERN, spaceAfterEllipsis);
  return enforceLineEdges(foldWhitespace(fixMusicSpacing(text)));
}

function finalMarksStart(text: string, ignoresTrailingSpace: boolean): number {
  let end = text.length;
  if (ignoresTrailingSpace) while (end > 0 && WHITESPACE_PATTERN.test(text[end - 1]!)) end--;
  for (;;) {
    if (end > 0 && FINAL_CLOSERS.includes(text[end - 1]!)) end--;
    else if (end >= CLOSING_TAG_LENGTH && text[end - 1] === ">" && CLOSING_TAGS.has(text.slice(end - CLOSING_TAG_LENGTH, end))) end -= CLOSING_TAG_LENGTH;
    else break;
  }
  const marksEnd = end;
  while (end > 0 && FINAL_MARKS.includes(text[end - 1]!)) end--;
  return end < marksEnd ? end : -1;
}

const isSpacedBeforeMarks = (text: string, marksStart: number): boolean => marksStart > 0 && WHITESPACE_PATTERN.test(text[marksStart - 1]!);

export function trimSpaceBeforeFinalPunctuation(translated: string, sourceText: string): string {
  const marksStart = finalMarksStart(translated, false);
  if (!isSpacedBeforeMarks(translated, marksStart) || isSpacedBeforeMarks(sourceText, finalMarksStart(sourceText, true))) return translated;
  let spaceStart = marksStart - 1;
  while (spaceStart > 0 && WHITESPACE_PATTERN.test(translated[spaceStart - 1]!)) spaceStart--;
  return translated.slice(0, spaceStart) + translated.slice(marksStart);
}

export function dropMarkerOnlyStylePairs(translated: string, sourceText: string): string {
  if (!translated.includes("</") || WHITESPACE_PATTERN.test(stripStyling(sourceText).trim())) return translated;
  return translated.replace(MARKER_ONLY_STYLE_PAIR_PATTERN, "");
}

export function stripUnsourcedBrackets(originalText: string, translatedText: string): string {
  if (!BRACKET_CHAR_PATTERN.test(translatedText) || BRACKET_CHAR_PATTERN.test(originalText)) return translatedText;
  let stripped = translatedText;
  for (let previous = ""; previous !== stripped; ) {
    previous = stripped;
    stripped = stripped.replace(BRACKET_CONTENT_PATTERN, "");
  }
  return stripped;
}

export function determineDashStyle(cues: Cue[]): string {
  let spaced = 0;
  let unspaced = 0;
  for (const cue of cues) {
    if (!cue.text.includes("-")) continue;
    for (const rawLine of cue.text.split("\n")) {
      const line = (rawLine.includes("<") ? rawLine.replace(STYLE_TAG_PATTERN, "") : rawLine).trim();
      if (!line.startsWith("-")) continue;
      if (line.startsWith("- ")) spaced += 1;
      else unspaced += 1;
    }
    if (spaced + unspaced >= DASH_STYLE_SAMPLE_LIMIT) break;
  }
  const total = spaced + unspaced;
  return total > 0 && spaced / total >= 2 / 3 ? "- " : "-";
}
