const ARABIC_LETTER_TO_PERSO_ARABIC: Readonly<Record<string, string>> = { "ي": "ی", "ى": "ی", "ك": "ک" };
const ARABIC_LETTERS = /[يىك]/g;

export const foldToPersoArabicLetters = (text: string): string => text.replace(ARABIC_LETTERS, (letter) => ARABIC_LETTER_TO_PERSO_ARABIC[letter]);
