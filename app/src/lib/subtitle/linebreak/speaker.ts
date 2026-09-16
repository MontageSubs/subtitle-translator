const STYLE_TAG_ALT = "(?:</?(?:i|b|u)>)";
const DIALOGUE_DASH_PATTERN = new RegExp(`(?:^|(?<=\\s))${STYLE_TAG_ALT}*[-—–](?![-—–])${STYLE_TAG_ALT}*\\s?`, "g");

export function splitSpeakers(text: string): [string, string] | null {
  const matches = [...text.matchAll(DIALOGUE_DASH_PATTERN)];
  if (matches.length !== 2) return null;
  const [first, second] = matches;
  const firstPart = text.slice(first.index! + first[0].length, second.index!).trim();
  const secondPart = text.slice(second.index! + second[0].length).trim();
  if (!firstPart || !secondPart) return null;
  return [`- ${firstPart}`, `- ${secondPart}`];
}
