import { typesetArabicScriptPunctuation } from "./arabicScriptPunctuation";

const ARABIC_LETTER_TO_PERSIAN: Readonly<Record<string, string>> = { "ي": "ی", "ى": "ی", "ك": "ک" };
const ARABIC_LETTERS = /[يىك]/g;

export const typesetPersian = (text: string): string => typesetArabicScriptPunctuation(text.replace(ARABIC_LETTERS, (letter) => ARABIC_LETTER_TO_PERSIAN[letter]));
