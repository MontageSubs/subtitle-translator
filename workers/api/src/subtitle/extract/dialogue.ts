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

function mayOpenDialogue(lead: string): boolean {
  const spoken = lead.replace(STYLE_TAG_PATTERN, "");
  return !spoken.trim() || (FINISHED_TURN_PATTERN.test(lead) && SPOKEN_CONTENT_PATTERN.test(spoken));
}

function dialogueDashes(text: string): RegExpExecArray[] {
  const matches = [...text.matchAll(DIALOGUE_DASH_PATTERN)];
  const opening = matches.findIndex((match) => mayOpenDialogue(text.slice(0, match.index)));
  return opening < 0 ? [] : matches.slice(opening);
}

export function splitDialogue(text: string): string[] {
  if (!mayHaveDialogueDash(text)) return [text];
  const dashes = dialogueDashes(text);
  if (!dashes.length) return [text];
  const segments = dashes.map((match, i) => `${match[1]}${match[2]}${text.slice(match.index + match[0].length, dashes[i + 1]?.index).trim()}`);
  if (dashes[0]!.index > 0) segments.unshift(text.slice(0, dashes[0]!.index).trim());
  const filtered = balanceStyleTags(segments).filter(Boolean);
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
