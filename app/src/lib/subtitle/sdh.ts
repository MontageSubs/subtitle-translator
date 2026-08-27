import { Cue } from '../../utils/types';

const MUSIC_NOTE_CHARS = "\u2669\u266a\u266b\u266c";
const MUSIC_NOTE_PATTERN = new RegExp(`[${MUSIC_NOTE_CHARS}]`);
const INNER_B = "\\[\\]\\(\\)\\{\\}\uff08\uff09\u3010\u3011";
const SDH_BRACKET_PATTERN = new RegExp(
  `\\[[^${INNER_B}]*\\]|\\([^${INNER_B}]*\\)|\\{[^${INNER_B}]*\\}|\uff08[^${INNER_B}]*\uff09|\u3010[^${INNER_B}]*\u3011`,
  "g"
);
const WHITESPACE_PATTERN = /\s+/g;
const COLON = ":";
const NARRATOR_BLOCK_PHRASES = [
  "previously on", "improved by", " is ", " are ", " were ", " was ",
  " think ", " guess ", " will ", " believe ", " say ", " said ",
  " do ", " want ", "that's ",
];

function isAllUppercase(text: string): boolean {
  return /[A-Za-z]/.test(text) && text.toUpperCase() === text;
}

function isInsideColonBrackets(line: string, index: number): boolean {
  let idx = line.lastIndexOf("(", index - 1);
  if (idx >= 0 && line.indexOf(")", idx) > index) return true;
  idx = line.lastIndexOf("[", index - 1);
  if (idx >= 0 && line.indexOf("]", idx) > index) return true;
  return false;
}

function isBetweenDigits(line: string, index: number): boolean {
  return index > 0 && index < line.length - 1 && /\d/.test(line[index - 1]) && /\d/.test(line[index + 1]);
}

function isTrailingColonOnly(line: string): boolean {
  return !line.replace(/:+$/, "").includes(COLON);
}

function shouldRemoveNarrator(pre: string): boolean {
  const lowered = pre.toLowerCase();
  if (pre.length > 30 || lowered.includes("http") || pre.includes(", ")) return false;
  if (pre.length > 15 && NARRATOR_BLOCK_PHRASES.some((p) => lowered.includes(p))) return false;
  return true;
}

function stripSpeakerTagLine(line: string, lines: string[], index: number): string {
  if (!line.includes(COLON)) return line;
  const indexOfColon = line.indexOf(COLON);
  const isLastLine = index === lines.length - 1;
  if (indexOfColon <= 0 || isInsideColonBrackets(line, indexOfColon)) return line;
  if (isLastLine && isTrailingColonOnly(line) && (line.match(/ /g) || []).length > 1) return line;
  const pre = line.slice(0, indexOfColon);
  if (!isAllUppercase(pre)) return line;
  if (isBetweenDigits(line, indexOfColon)) return line;
  if (!shouldRemoveNarrator(pre)) return line;
  if (lines.length === 2 && index === 1) {
    const firstLine = lines[0].replace(/"+$/, "");
    if (!/[.!?\u266a\u266b]$|--$|\u2014$/.test(firstLine)) return line;
  }
  let content = line.slice(indexOfColon + 1).trim();
  if (!content) return "";
  if (content[0] === content[0].toLowerCase() && content[0] !== content[0].toUpperCase()) {
    content = content[0].toUpperCase() + content.slice(1);
  }
  return content;
}

function stripSpeakerTags(lines: string[]): string[] {
  const joined = lines.join("\n");
  if (joined.length > 10 && joined.endsWith(COLON) && !isAllUppercase(joined)) return lines;
  return lines.map((line, i) => stripSpeakerTagLine(line, lines, i));
}

function stripBrackets(text: string): string {
  const original = text;
  while (true) {
    const next = text.replace(SDH_BRACKET_PATTERN, "");
    if (next === text) break;
    text = next;
  }
  const cleaned = text.replace(WHITESPACE_PATTERN, " ").trim();
  if (!cleaned && MUSIC_NOTE_PATTERN.test(original)) {
    return (original.match(new RegExp(`[${MUSIC_NOTE_CHARS}]`, "g")) || []).join(" ");
  }
  return cleaned;
}

function stripCueSdh(text: string): string {
  const lines = text.split("\n").filter(Boolean);
  const withoutSpeakerTags = lines.length && !lines.some((l) => MUSIC_NOTE_PATTERN.test(l)) ? stripSpeakerTags(lines) : lines;
  return stripBrackets(withoutSpeakerTags.filter(Boolean).join(" "));
}

export const SDH_SOURCE_LANG = "en";

export interface SdhStripResult {
  cues: Cue[];
  stats: { dropped: number; stripped: number };
}

export function applySdhStripping(cues: Cue[], sourceLang: string, enabled: boolean): SdhStripResult {
  if (!enabled || sourceLang.split("-")[0].toLowerCase() !== SDH_SOURCE_LANG) {
    return { cues, stats: { dropped: 0, stripped: 0 } };
  }
  const stats = { dropped: 0, stripped: 0 };
  const result: Cue[] = [];
  for (const cue of cues) {
    const stripped = stripCueSdh(cue.text);
    if (stripped !== cue.text) stats[stripped ? "stripped" : "dropped"] += 1;
    if (stripped) result.push({ ...cue, text: stripped });
  }
  return { cues: result, stats };
}
