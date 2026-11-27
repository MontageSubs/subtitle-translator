import { balanceStyleTags, STYLE_TAG_ALT, STYLE_TAG_PATTERN } from "../common/markup";
import { isBlank, isBracketClose, isBracketOpen } from "./edges";

const DIALOGUE_DASH_PATTERN = new RegExp(`(?:^|(?<=\\s))(${STYLE_TAG_ALT}*)-(?!-)(${STYLE_TAG_ALT}*)\\s?`, "gi");
const FINISHED_TURN_PATTERN = /(?:[.?!…。！？؟۔।॥♩♪♫♬—–]|--|(?<=\S)-)(?:["'”’»)\]」』\s]|<\/?[ibu]>)*$/i;
const SPOKEN_CONTENT_PATTERN = /[\p{L}\p{N}]/u;

function mayHaveDialogueDash(text: string): boolean {
  for (let at = text.indexOf("-"); at >= 0; at = text.indexOf("-", at + 1)) {
    const before = at === 0 ? 32 : text.charCodeAt(at - 1);
    if ((before === 62 || isBlank(before)) && text.charCodeAt(at + 1) !== 45) return true;
  }
  return false;
}

export interface DialogueSegment {
  text: string;
  start: number;
  end: number;
}

function mayOpenDialogue(lead: string): boolean {
  const spoken = lead.replace(STYLE_TAG_PATTERN, "");
  return !spoken.trim() || (FINISHED_TURN_PATTERN.test(lead) && SPOKEN_CONTENT_PATTERN.test(spoken));
}

function dialogueDashes(text: string): RegExpExecArray[] {
  const matches = [...text.matchAll(DIALOGUE_DASH_PATTERN)];
  const opening = matches.findIndex((match) => mayOpenDialogue(text.slice(0, match.index)));
  return opening < 0 ? [] : matches.slice(opening);
}

function trimmedSegment(text: string, from: number, to: number): DialogueSegment | null {
  const raw = text.slice(from, to);
  const start = from + (raw.length - raw.trimStart().length);
  const end = to - (raw.length - raw.trimEnd().length);
  return start < end ? { text: text.slice(start, end), start, end } : null;
}

export function dialogueSegments(text: string): DialogueSegment[] {
  const whole = trimmedSegment(text, 0, text.length);
  if (!mayHaveDialogueDash(text)) return whole ? [whole] : [];
  const dashes = dialogueDashes(text);
  if (!dashes.length) return whole ? [whole] : [];
  const turns = dashes.map((match, i) => {
    const to = dashes[i + 1]?.index ?? text.length;
    return {
      range: trimmedSegment(text, match.index + match[1]!.length + 1, to),
      content: `${match[1]}${match[2]}${text.slice(match.index + match[0].length, to).trim()}`,
    };
  });
  if (dashes[0]!.index > 0) {
    const range = trimmedSegment(text, 0, dashes[0]!.index);
    turns.unshift({ range, content: range?.text ?? "" });
  }
  const balanced = balanceStyleTags(turns.map((turn) => turn.content));
  return turns.flatMap(({ range }, i) => (range && balanced[i] ? { ...range, text: balanced[i]! } : []));
}

export function splitDialogue(text: string): string[] {
  if (!mayHaveDialogueDash(text)) return [text];
  const segments = dialogueSegments(text);
  return segments.length ? segments.map((segment) => segment.text) : [text];
}

export function replaceDialogueSegments(text: string, replacements: ReadonlyMap<number, string>): string {
  let result = text;
  const segments = dialogueSegments(text);
  for (let index = segments.length - 1; index >= 0; index--) {
    const replacement = replacements.get(index);
    if (replacement !== undefined) result = `${result.slice(0, segments[index]!.start)}${replacement}${result.slice(segments[index]!.end)}`;
  }
  return result;
}

export function updateQuoteState(text: string, isPending: boolean): boolean {
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (code === 34) {
      if (index === 0 && isPending) continue;
      isPending = !isPending;
    } else if (code === 0x201c || code === 0x300c || code === 0xab) {
      isPending = true;
    } else if (code === 0x201d || code === 0x300d || code === 0xbb || isBracketClose(code)) {
      isPending = false;
    } else if (isBracketOpen(code)) {
      isPending = true;
    }
  }
  return isPending;
}
