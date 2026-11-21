import { typesetArabicScriptPunctuation } from "./arabicScriptPunctuation";
import { foldToPersoArabicLetters } from "./persoArabicLetters";

export const typesetPersian = (text: string): string => typesetArabicScriptPunctuation(foldToPersoArabicLetters(text));
