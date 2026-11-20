import { typesetArabicScriptPunctuation } from "./arabicScriptPunctuation";

const PERSIAN_LETTER_TO_ARABIC: Readonly<Record<string, string>> = { "ی": "ي", "ک": "ك" };
const PERSIAN_LETTERS = /[یک]/g;

export const typesetArabic = (text: string): string => typesetArabicScriptPunctuation(text.replace(PERSIAN_LETTERS, (letter) => PERSIAN_LETTER_TO_ARABIC[letter]));
