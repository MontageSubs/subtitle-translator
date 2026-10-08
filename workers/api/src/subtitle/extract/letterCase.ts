import { STYLE_OPEN_ALT } from "./tagAlternations";

const STYLE_TAG_LEADING_PATTERN = new RegExp(`^${STYLE_OPEN_ALT}+`, "i");
const LEADING_NON_LETTER_PATTERN = /^[^A-Za-z]*/;

export function firstLetterIsLower(text: string): boolean {
  const unstyled = text.replace(STYLE_TAG_LEADING_PATTERN, "");
  const rest = unstyled.slice(LEADING_NON_LETTER_PATTERN.exec(unstyled)![0].length);
  return Boolean(rest) && rest[0] === rest[0]!.toLowerCase() && rest[0] !== rest[0]!.toUpperCase();
}
