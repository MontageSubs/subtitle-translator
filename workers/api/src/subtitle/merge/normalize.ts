import type { Cue } from "../types";
import type { TargetRules } from "../languages/types";
import { isLetterOrNumberCode } from "../contentChars";
import { ELLIPSIS_PATTERN, NO_LINE_END_CHARS, NO_LINE_START_CHARS, WHITESPACE_COLLAPSE_PATTERN } from "./characters";
import { fixMusicSpacing } from "./music";
import { STYLE_TAG_PATTERN } from "../common/markup";

const DASH_ARTIFACT_PATTERN = /—+|-{2,}/g;
const CJK_TERMINATOR_PATTERN = /[。，、]/g;
const HALFWIDTH_COMMA_PATTERN = /(?<!\d)[,](?!\d)/g;
const BRACKET_CHAR_PATTERN = /[()（）\[\]【】{}]/;
const BRACKET_CONTENT_PATTERN = /[(（\[【{][^()（）\[\]【】{}]*[)）\]】}]/g;
const EXCLAIM_QUESTION_TEST_PATTERN = /[！？!?]/;
const EXCLAIM_QUESTION_RUN_PATTERN = /[！？!?]+/g;
const DASH_REPLACE_PATTERN = /(^|\s)-\s*/g;
const FULLWIDTH_TO_ASCII: Record<string, string> = { "！": "!", "？": "?" };
const DASH_STYLE_SAMPLE_LIMIT = 9;

function enforceLineEdges(text: string): string {
  while (text && NO_LINE_START_CHARS.has(text[0]!)) text = text.slice(1).trimStart();
  while (text && NO_LINE_END_CHARS.has(text[text.length - 1]!)) text = text.slice(0, -1).trimEnd();
  return text;
}

function lastContentIndex(text: string): number {
  for (let i = text.length - 1; i >= 0; i--) {
    let code = text.charCodeAt(i);
    let start = i;
    if (code >= 0xdc00 && code <= 0xdfff && i > 0 && text.charCodeAt(i - 1) >= 0xd800 && text.charCodeAt(i - 1) <= 0xdbff) {
      code = text.codePointAt(i - 1)!;
      start = --i;
    }
    if (code === 95 || isLetterOrNumberCode(code)) return start;
  }
  return -1;
}

function terminatorStripper(text: string): (matched: string, offset: number) => string {
  const lastContent = lastContentIndex(text);
  return (matched, offset) => (lastContent >= offset + matched.length ? " " : "");
}

function spaceAfterEllipsis(matched: string, offset: number, full: string): string {
  const end = offset + matched.length;
  return end === full.length || /\s/.test(full[end]!) || NO_LINE_START_CHARS.has(full[end]!) ? "..." : "... ";
}

export function normalizeTranslation(text: string, rules: TargetRules): string {
  text = text.replace(DASH_ARTIFACT_PATTERN, "...").replace(ELLIPSIS_PATTERN, spaceAfterEllipsis);
  if (rules.stripsCjkTerminalPunctuation) {
    text = text.replace(CJK_TERMINATOR_PATTERN, terminatorStripper(text));
    text = text.replace(HALFWIDTH_COMMA_PATTERN, terminatorStripper(text));
  }
  return enforceLineEdges(fixMusicSpacing(text).replace(WHITESPACE_COLLAPSE_PATTERN, " ").trim());
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

export function normalizeExclaimQuestion(text: string): string {
  if (!EXCLAIM_QUESTION_TEST_PATTERN.test(text)) return text;
  return text.replace(EXCLAIM_QUESTION_RUN_PATTERN, (match, offset: number) => {
    const run = [...match].map((char) => FULLWIDTH_TO_ASCII[char] || char).join("");
    const end = offset + match.length;
    return end === text.length || text[end] === " " ? run : run + " ";
  });
}

export function determineDashStyle(cues: Cue[]): string {
  let spaced = 0;
  let unspaced = 0;
  for (const cue of cues) {
    for (const rawLine of cue.text.split("\n")) {
      const line = rawLine.replace(STYLE_TAG_PATTERN, "").trim();
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
