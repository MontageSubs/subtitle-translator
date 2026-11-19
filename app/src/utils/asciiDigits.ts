const DIGIT_ZERO_CODE_POINTS = [0x0660, 0x06f0, 0x0966, 0x09e6, 0x0a66, 0x0ae6, 0x0b66, 0x0be6, 0x0c66, 0x0ce6, 0x0d66, 0x0e50, 0x0ed0, 0xff10];
const NON_ASCII_DIGIT_OR_DECIMAL_MARK = /[\u0660-\u0669\u06f0-\u06f9\u0966-\u096f\u09e6-\u09ef\u0a66-\u0a6f\u0ae6-\u0aef\u0b66-\u0b6f\u0be6-\u0bef\u0c66-\u0c6f\u0ce6-\u0cef\u0d66-\u0d6f\u0e50-\u0e59\u0ed0-\u0ed9\uff10-\uff19\u066b]/g;
const ARABIC_DECIMAL_SEPARATOR = "\u066b";

function asciiOf(character: string): string {
  if (character === ARABIC_DECIMAL_SEPARATOR) return ".";
  const codePoint = character.charCodeAt(0);
  const zero = DIGIT_ZERO_CODE_POINTS.find((candidate) => codePoint >= candidate && codePoint < candidate + 10)!;
  return String(codePoint - zero);
}

export const toAsciiDigits = (text: string): string => text.replace(NON_ASCII_DIGIT_OR_DECIMAL_MARK, asciiOf);
