import { typesetArabicScriptPunctuation } from "./arabicScriptPunctuation";
import { foldToPersoArabicLetters } from "./persoArabicLetters";

const LATIN_FULL_STOP_AFTER_URDU_LETTER = /([\u0600-\u06FF\u200C])\.(?![.\p{L}\p{N}])/gu;
const URDU_FULL_STOP = "۔";

export const typesetUrdu = (text: string): string =>
  typesetArabicScriptPunctuation(foldToPersoArabicLetters(text)).replace(LATIN_FULL_STOP_AFTER_URDU_LETTER, `$1${URDU_FULL_STOP}`);
