const NON_ASCII_ALNUM_PATTERN = /[\p{L}\p{N}]/u;
const BMP_SIZE = 0x10000;
const UNKNOWN = 0;
const ALNUM = 1;
const NOT_ALNUM = 2;
const bmpMemo = new Uint8Array(BMP_SIZE);
const astralMemo = new Map<number, boolean>();

export const isAsciiLetter = (code: number): boolean => (code >= 65 && code <= 90) || (code >= 97 && code <= 122);

export const isAsciiDigit = (code: number): boolean => code >= 48 && code <= 57;

export function isNonAsciiAlnum(code: number): boolean {
  if (code < BMP_SIZE) {
    let known = bmpMemo[code]!;
    if (known === UNKNOWN) bmpMemo[code] = known = NON_ASCII_ALNUM_PATTERN.test(String.fromCharCode(code)) ? ALNUM : NOT_ALNUM;
    return known === ALNUM;
  }
  let known = astralMemo.get(code);
  if (known === undefined) astralMemo.set(code, (known = NON_ASCII_ALNUM_PATTERN.test(String.fromCodePoint(code))));
  return known;
}

export const MUSIC_NOTE_CHARS = "♩♪♫♬";

export const MUSIC_NOTE_PATTERN = new RegExp(`[${MUSIC_NOTE_CHARS}]`);

export const isMusicText = (text: string): boolean => MUSIC_NOTE_PATTERN.test(text);
