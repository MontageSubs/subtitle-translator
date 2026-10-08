const COLON = ":";

const NARRATOR_BLOCK_PHRASES = [
  "previously on", "improved by", " is ", " are ", " were ", " was ",
  " think ", " guess ", " will ", " believe ", " say ", " said ",
  " do ", " want ", "that's ",
];
const SENTENCE_END_PATTERN = /[.!?\u266a\u266b]$|--$|\u2014$/;
const MIN_JOINED_LENGTH_FOR_TRAILING_COLON = 10;
const MAX_SPEAKER_LENGTH = 30;
const NARRATOR_PHRASE_MIN_LENGTH = 15;

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
  return index > 0 && index < line.length - 1 && /\d/.test(line[index - 1]) && /\d/.test(line[index + 1]);
}

function isTrailingColonOnly(line: string): boolean {
  return !line.replace(/:+$/, "").includes(COLON);
}

function shouldRemoveNarrator(prefix: string): boolean {
  const lowered = prefix.toLowerCase();
  if (prefix.length > MAX_SPEAKER_LENGTH || lowered.includes("http") || prefix.includes(", ")) return false;
  return !(prefix.length > NARRATOR_PHRASE_MIN_LENGTH && NARRATOR_BLOCK_PHRASES.some((phrase) => lowered.includes(phrase)));
}

function capitalizeFirst(text: string): string {
  const first = text[0];
  return first === first.toLowerCase() && first !== first.toUpperCase() ? first.toUpperCase() + text.slice(1) : text;
}

function stripSpeakerTagLine(line: string, lines: string[], index: number): string {
  const colonIndex = line.indexOf(COLON);
  if (colonIndex <= 0 || isInsideColonBrackets(line, colonIndex)) return line;
  const isLastLine = index === lines.length - 1;
  if (isLastLine && isTrailingColonOnly(line) && line.split(" ").length > 2) return line;
  const prefix = line.slice(0, colonIndex);
  if (!isAllUppercase(prefix) || isBetweenDigits(line, colonIndex) || !shouldRemoveNarrator(prefix)) return line;
  if (lines.length === 2 && index === 1 && !SENTENCE_END_PATTERN.test(lines[0].replace(/"+$/, ""))) return line;
  const content = line.slice(colonIndex + 1).trim();
  return content ? capitalizeFirst(content) : "";
}

export function stripSpeakerTags(lines: string[]): string[] {
  const joined = lines.join("\n");
  if (joined.length > MIN_JOINED_LENGTH_FOR_TRAILING_COLON && joined.endsWith(COLON) && !isAllUppercase(joined)) return lines;
  return lines.map((line, index) => stripSpeakerTagLine(line, lines, index));
}
