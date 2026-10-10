const NON_ASCII_ALNUM_PATTERN = /[\p{L}\p{N}]/u;
const alnumMemo = new Map<number, boolean>();

export const isAsciiLetter = (code: number): boolean => (code >= 65 && code <= 90) || (code >= 97 && code <= 122);

export const isAsciiDigit = (code: number): boolean => code >= 48 && code <= 57;

export function isNonAsciiAlnum(code: number): boolean {
  let known = alnumMemo.get(code);
  if (known === undefined) alnumMemo.set(code, (known = NON_ASCII_ALNUM_PATTERN.test(String.fromCodePoint(code))));
  return known;
}

export const MUSIC_NOTE_CHARS = "♩♪♫♬";

export const MUSIC_NOTE_PATTERN = new RegExp(`[${MUSIC_NOTE_CHARS}]`);

export const isMusicText = (text: string): boolean => MUSIC_NOTE_PATTERN.test(text);
