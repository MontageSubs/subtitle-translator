import { isRightToLeftLanguage } from "../common/languageCodes";

const RIGHT_TO_LEFT_EMBEDDING = "\u202B";
const POP_DIRECTIONAL_FORMATTING = "\u202C";
const RIGHT_TO_LEFT_LETTER = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/u;
const LEFT_TO_RIGHT_LETTER = /(?![\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF])\p{L}/u;
const MARKUP = /<\/?[a-z]+>|\{[^}]*\}/gi;

const visibleText = (text: string): string => text.replace(MARKUP, "");

export function guardRightToLeftLines(text: string, targetLang: string, companionText = ""): string {
  if (!text || !isRightToLeftLanguage(targetLang)) return text;
  const companionIsLeftToRight = LEFT_TO_RIGHT_LETTER.test(visibleText(companionText));
  return text
    .split("\n")
    .map((line) => {
      const visible = visibleText(line);
      const needsGuard = RIGHT_TO_LEFT_LETTER.test(visible) && (companionIsLeftToRight || LEFT_TO_RIGHT_LETTER.test(visible));
      return needsGuard && !line.startsWith(RIGHT_TO_LEFT_EMBEDDING) ? `${RIGHT_TO_LEFT_EMBEDDING}${line}${POP_DIRECTIONAL_FORMATTING}` : line;
    })
    .join("\n");
}
