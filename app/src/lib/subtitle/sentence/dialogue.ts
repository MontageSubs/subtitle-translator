import { STYLE_TAG_ALT } from "../common/markup";
import { isBlank, isBracketClose, isBracketOpen } from "./edges";

const DIALOGUE_DASH_PATTERN = new RegExp(`(?:^|(?<=\\s))${STYLE_TAG_ALT}*-(?!-)${STYLE_TAG_ALT}*\\s?`, "gi");

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

function trimmedSegment(text: string, from: number, to: number): DialogueSegment | null {
  const raw = text.slice(from, to);
  const start = from + (raw.length - raw.trimStart().length);
  const end = to - (raw.length - raw.trimEnd().length);
  return start < end ? { text: text.slice(start, end), start, end } : null;
}

export function dialogueSegments(text: string): DialogueSegment[] {
  const whole = trimmedSegment(text, 0, text.length);
  if (!mayHaveDialogueDash(text)) return whole ? [whole] : [];
  const matches = [...text.matchAll(DIALOGUE_DASH_PATTERN)];
  if (!matches.length) return whole ? [whole] : [];
  const bounds: [number, number][] = [];
  if (matches[0]!.index! > 0) bounds.push([0, matches[0]!.index!]);
  matches.forEach((match, i) => bounds.push([match.index! + match[0].length, i + 1 < matches.length ? matches[i + 1]!.index! : text.length]));
  return bounds.flatMap(([from, to]) => trimmedSegment(text, from, to) ?? []);
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
