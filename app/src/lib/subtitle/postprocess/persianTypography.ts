const ARABIC_LETTER_TO_PERSIAN: Readonly<Record<string, string>> = { "ي": "ی", "ى": "ی", "ك": "ک" };
const ARABIC_LETTERS = /[يىك]/g;
const LATIN_PUNCTUATION_AFTER_PERSIAN_WORD = /([\u0600-\u06FF\u200C])[ \t]*([,;?])/g;
const PERSIAN_PUNCTUATION_BY_LATIN: Readonly<Record<string, string>> = { ",": "،", ";": "؛", "?": "؟" };
const SPACE_BEFORE_PERSIAN_PUNCTUATION = /[ \t]+(?=[،؛؟])/g;

export function typesetPersian(text: string): string {
  return text
    .replace(ARABIC_LETTERS, (letter) => ARABIC_LETTER_TO_PERSIAN[letter])
    .replace(LATIN_PUNCTUATION_AFTER_PERSIAN_WORD, (_, letter: string, mark: string) => `${letter}${PERSIAN_PUNCTUATION_BY_LATIN[mark]}`)
    .replace(SPACE_BEFORE_PERSIAN_PUNCTUATION, "");
}
