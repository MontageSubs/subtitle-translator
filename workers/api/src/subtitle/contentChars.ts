import { isAsciiDigit, isAsciiLetter, isNonAsciiAlnum } from "./common/charClass";

const CONTENT_CHAR_PATTERN = /[\p{L}\p{N}_]/u;

export const hasContentChars = (text: string): boolean => CONTENT_CHAR_PATTERN.test(text);

const isLetterOrNumberCode = (code: number): boolean =>
  code < 128 ? isAsciiLetter(code) || isAsciiDigit(code) : isNonAsciiAlnum(code);

export function countContentChars(text: string): number {
  let count = 0;
  for (let i = 0; i < text.length; i++) {
    let code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      code = text.codePointAt(i)!;
      i++;
    }
    if (code === 95 || isLetterOrNumberCode(code)) count++;
  }
  return count;
}
