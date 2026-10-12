import { STYLE_TAG_PATTERN } from "../common/markup";

const COLON = ":";

const NARRATOR_BLOCK_PHRASES = [
  "previously on", "improved by", " is ", " are ", " were ", " was ",
  " think ", " guess ", " will ", " believe ", " say ", " said ",
  " do ", " want ", "that's ",
];
const SENTENCE_END_PATTERN = /[.!?\u266a\u266b]$|--$|\u2014$/;
const LEADING_DASH_PATTERN = /^\s*[-\u2013\u2014]/;
const LABEL_LEAD_PATTERN = /^[-\u2013\u2014\s]*/;
const LEADING_CAPITAL_PATTERN = /^((?:<[iIbBuU]>)*)(\p{Ll})/u;
const MIN_JOINED_LENGTH_FOR_TRAILING_COLON = 10;
const MAX_SPEAKER_LENGTH = 30;
const NARRATOR_PHRASE_MIN_LENGTH = 15;

interface TaggedLine {
  text: string;
  speaker: string | null;
}

const toPlain = (line: string): string => (line.includes("<") ? line.replace(STYLE_TAG_PATTERN, "") : line);

const styleTagsOf = (text: string): string => text.match(STYLE_TAG_PATTERN)?.join("") ?? "";

function isAllUppercase(text: string): boolean {
  return /\p{L}/u.test(text) && text.toUpperCase() === text;
}

function isInsideColonBrackets(line: string, index: number): boolean {
  const open = line.lastIndexOf("(", index - 1);
  if (open >= 0 && line.indexOf(")", open) > index) return true;
  const square = line.lastIndexOf("[", index - 1);
  return square >= 0 && line.indexOf("]", square) > index;
}

function isBetweenDigits(line: string, index: number): boolean {
  return index > 0 && index < line.length - 1 && /\d/.test(line[index - 1]!) && /\d/.test(line[index + 1]!);
}

function isTrailingColonOnly(line: string): boolean {
  return !line.replace(/:+$/, "").includes(COLON);
}

function shouldRemoveNarrator(label: string): boolean {
  const lowered = label.toLowerCase();
  if (label.length > MAX_SPEAKER_LENGTH || lowered.includes("http") || label.includes(", ")) return false;
  return !(label.length > NARRATOR_PHRASE_MIN_LENGTH && NARRATOR_BLOCK_PHRASES.some((phrase) => lowered.includes(phrase)));
}

function capitalizeFirst(text: string): string {
  return text.replace(LEADING_CAPITAL_PATTERN, (_, tags: string, letter: string) => tags + letter.toUpperCase());
}

function tagSpeakerLine(line: string, plainLines: string[], index: number, previousSpeaker: string | null): TaggedLine {
  const untouched: TaggedLine = { text: line, speaker: null };
  const plain = plainLines[index]!;
  const colonIndex = plain.indexOf(COLON);
  if (colonIndex <= 0 || isInsideColonBrackets(plain, colonIndex)) return untouched;
  if (index === plainLines.length - 1 && isTrailingColonOnly(plain) && plain.split(" ").length > 2) return untouched;
  const prefix = plain.slice(0, colonIndex);
  const lead = LABEL_LEAD_PATTERN.exec(prefix)![0];
  const label = prefix.slice(lead.length).trim();
  if (!isAllUppercase(label) || isBetweenDigits(plain, colonIndex) || !shouldRemoveNarrator(label)) return untouched;
  const continuesSentence = plainLines.length === 2 && index === 1 && previousSpeaker === null && !SENTENCE_END_PATTERN.test(plainLines[0]!.replace(/"+$/, ""));
  if (continuesSentence) return untouched;
  const rawColon = line.indexOf(COLON);
  const content = styleTagsOf(line.slice(0, rawColon)) + line.slice(rawColon + 1).trim();
  const speaker = label.replace(/\s+/g, " ");
  const dash = LEADING_DASH_PATTERN.test(prefix) ? "- " : "";
  const body = speaker === previousSpeaker ? content : capitalizeFirst(content);
  return { text: toPlain(content).trim() ? dash + body : "", speaker };
}

function insertTurnDashes(entries: TaggedLine[]): string[] {
  const turnStarts: number[] = [];
  const kept: string[] = [];
  let current: string | null = null;
  let turnPending = true;
  for (const { text, speaker } of entries) {
    if (speaker && speaker !== current) {
      current = speaker;
      turnPending = true;
    }
    if (!text) continue;
    if (turnPending) turnStarts.push(kept.length);
    turnPending = false;
    kept.push(text);
  }
  if (turnStarts.length < 2) return kept;
  for (const at of turnStarts) if (!LEADING_DASH_PATTERN.test(toPlain(kept[at]!))) kept[at] = `- ${kept[at]}`;
  return kept;
}

export function stripSpeakerTags(lines: string[]): string[] {
  const plainLines = lines.map(toPlain);
  const joined = plainLines.join("\n");
  if (joined.length > MIN_JOINED_LENGTH_FOR_TRAILING_COLON && joined.endsWith(COLON) && !isAllUppercase(joined)) return lines;
  let previousSpeaker: string | null = null;
  const entries = lines.map((line, index) => {
    const entry = tagSpeakerLine(line, plainLines, index, previousSpeaker);
    previousSpeaker = entry.speaker ?? previousSpeaker;
    return entry;
  });
  return entries.some((entry) => entry.speaker) ? insertTurnDashes(entries) : lines;
}
