import { isAlnumCode } from "./common/charClass";

const CONTENT_CHAR_PATTERN = /[\p{L}\p{N}_]/u;

export const hasContentChars = (text: string): boolean => CONTENT_CHAR_PATTERN.test(text);

export function countContentChars(text: string): number {
  let count = 0;
  for (let i = 0; i < text.length; i++) {
    let code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      code = text.codePointAt(i)!;
      i++;
    }
    if (code === 95 || isAlnumCode(code)) count++;
  }
  return count;
}
