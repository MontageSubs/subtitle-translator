import { STYLE_TAG_ALT, stripMarkup } from "../../common/markup";

const DIALOGUE_DASH_PATTERN = new RegExp(`(?:^|(?<=\\s))(${STYLE_TAG_ALT}*)[-—–](?![-—–])(${STYLE_TAG_ALT}*)\\s?`, "g");

const speakerLine = ([, tagsBeforeDash, tagsAfterDash]: RegExpExecArray, speech: string): string => `${tagsBeforeDash}- ${tagsAfterDash}${speech}`;

export function splitSpeakers(text: string): [string, string] | null {
  const matches = [...text.matchAll(DIALOGUE_DASH_PATTERN)];
  if (matches.length !== 2) return null;
  const [first, second] = matches;
  const lead = text.slice(0, first.index).trim();
  if (stripMarkup(lead).trim()) return null;
  const firstPart = text.slice(first.index! + first[0].length, second.index!).trim();
  const secondPart = text.slice(second.index! + second[0].length).trim();
  if (!firstPart || !secondPart) return null;
  return [`${lead}${speakerLine(first, firstPart)}`, speakerLine(second, secondPart)];
}
