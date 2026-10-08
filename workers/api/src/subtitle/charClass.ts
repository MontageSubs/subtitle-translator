const NON_ASCII_ALNUM_PATTERN = /[\p{L}\p{N}]/u;
const alnumMemo = new Map<number, boolean>();

export const isAsciiLetter = (code: number): boolean => (code >= 65 && code <= 90) || (code >= 97 && code <= 122);

export const isAsciiDigit = (code: number): boolean => code >= 48 && code <= 57;

export function isNonAsciiAlnum(code: number): boolean {
  let known = alnumMemo.get(code);
  if (known === undefined) alnumMemo.set(code, (known = NON_ASCII_ALNUM_PATTERN.test(String.fromCodePoint(code))));
  return known;
}

export const isLetterOrNumberCode = (code: number): boolean =>
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
