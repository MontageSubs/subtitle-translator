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

export function splitDialogue(text: string): string[] {
  if (!mayHaveDialogueDash(text)) return [text];
  const matches = [...text.matchAll(DIALOGUE_DASH_PATTERN)];
  if (!matches.length) return [text];
  const segments: string[] = [];
  if (matches[0]!.index! > 0) segments.push(text.slice(0, matches[0]!.index!).trim());
  matches.forEach((match, i) => {
    const end = i + 1 < matches.length ? matches[i + 1]!.index! : text.length;
    segments.push(text.slice(match.index! + match[0].length, end).trim());
  });
  const filtered = segments.filter(Boolean);
  return filtered.length ? filtered : [text];
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
