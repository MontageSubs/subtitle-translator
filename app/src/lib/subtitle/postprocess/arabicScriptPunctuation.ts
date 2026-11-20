const LATIN_PUNCTUATION_AFTER_ARABIC_SCRIPT_WORD = /([\u0600-\u06FF\u200C])[ \t]*([,;?])/g;
const ARABIC_SCRIPT_PUNCTUATION_BY_LATIN: Readonly<Record<string, string>> = { ",": "،", ";": "؛", "?": "؟" };
const SPACE_BEFORE_ARABIC_SCRIPT_PUNCTUATION = /[ \t]+(?=[،؛؟])/g;

export function typesetArabicScriptPunctuation(text: string): string {
  return text
    .replace(LATIN_PUNCTUATION_AFTER_ARABIC_SCRIPT_WORD, (_, letter: string, mark: string) => `${letter}${ARABIC_SCRIPT_PUNCTUATION_BY_LATIN[mark]}`)
    .replace(SPACE_BEFORE_ARABIC_SCRIPT_PUNCTUATION, "");
}
