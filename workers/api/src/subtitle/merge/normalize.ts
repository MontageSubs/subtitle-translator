import type { Cue } from "../types";
import { ELLIPSIS_PATTERN, NO_LINE_END_CHARS, NO_LINE_START_CHARS, WHITESPACE_COLLAPSE_PATTERN } from "./characters";
import { fixMusicSpacing } from "./music";
import { STYLE_TAG_PATTERN, stripStyling } from "../common/markup";

const DASH_ARTIFACT_PATTERN = /—+|-{2,}/g;
const BRACKET_CHAR_PATTERN = /[()（）\[\]【】{}]/;
const BRACKET_CONTENT_PATTERN = /[(（\[【{][^()（）\[\]【】{}]*[)）\]】}]/g;
const DASH_REPLACE_PATTERN = /(^|\s)-\s*/g;
const DASH_STYLE_SAMPLE_LIMIT = 9;
const MARKER_ONLY_STYLE_PAIR_PATTERN = /<(i|b|u)>[\s\p{P}\p{S}]*<\/\1>/giu;
const WHITESPACE_PATTERN = /\s/;

function enforceLineEdges(text: string): string {
  while (text && NO_LINE_START_CHARS.has(text[0]!)) text = text.slice(1).trimStart();
  while (text && NO_LINE_END_CHARS.has(text[text.length - 1]!)) text = text.slice(0, -1).trimEnd();
  return text;
}

function spaceAfterEllipsis(matched: string, offset: number, full: string): string {
  const end = offset + matched.length;
  return end === full.length || /\s/.test(full[end]!) || NO_LINE_START_CHARS.has(full[end]!) ? "..." : "... ";
}

export function normalizeTranslation(text: string, defersPunctuationStyle: boolean): string {
  if (text.includes("—") || text.includes("--")) text = text.replace(DASH_ARTIFACT_PATTERN, "...");
  if (!defersPunctuationStyle && (text.includes("..") || text.includes("…"))) text = text.replace(ELLIPSIS_PATTERN, spaceAfterEllipsis);
  return enforceLineEdges(fixMusicSpacing(text).replace(WHITESPACE_COLLAPSE_PATTERN, " ").trim());
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

export const applyDashStyle = (text: string, dashStyle: string): string =>
  text.includes("-") ? text.replace(DASH_REPLACE_PATTERN, `$1${dashStyle}`) : text;
