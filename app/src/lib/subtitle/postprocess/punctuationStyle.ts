import { baseLanguage, isChineseLanguage } from "../common/languageCodes";

export interface PunctuationStyle {
  fullWidth: boolean;
  keepTerminators: boolean;
}

const DEFAULT_PUNCTUATION_STYLE: PunctuationStyle = { fullWidth: false, keepTerminators: false };

const CLOSING_MARKUP = "(?:</(?:i|b|u)>|\\{[^}]*\\}|['\"”’»›」』）)}\\]】♪♫♬♩])";
const SPACE_NOT_NEEDED = new RegExp(`^${CLOSING_MARKUP}*(?:$|\\s|[、，。！？；：,.!?;:…])`);
const LAST_CONTENT = /^[\s\S]*[\p{L}\p{N}_]/u;
const ELLIPSIS = /\.{2,}|…+/g;
const EXCLAIM_QUESTION_RUN = /[！？!?]+/g;
const FULL_WIDTH_RUN = /[！？]/;
const FULL_TO_HALF: Record<string, string> = { "！": "!", "？": "?", "，": ",", "。": ".", "、": "," };
const CHINESE_TERMINATORS = /[，。]|(?<!\d),(?!\d)/g;
const JAPANESE_TERMINATORS = /[、，。]|(?<!\d),(?!\d)/g;
const CHINESE_FULL_TERMINATORS = /[，。]/g;
const JAPANESE_FULL_TERMINATORS = /[、，。]/g;
const REPEATED_SPACES = / {2,}/g;

const needsSpaceAfter = (text: string, end: number): boolean => end < text.length && !SPACE_NOT_NEEDED.test(text.slice(end));

const isJapanese = (lang: string): boolean => baseLanguage(lang) === "ja";

function styleEllipses(text: string, fullWidth: boolean): string {
  if (!text.includes("..") && !text.includes("…")) return text;
  return text.replace(ELLIPSIS, (run, offset: number) => {
    if (fullWidth) return run.startsWith(".") ? "…" : run;
    return needsSpaceAfter(text, offset + run.length) ? "... " : "...";
  });
}

function stripTerminators(text: string, lang: string): string {
  const lastContent = LAST_CONTENT.exec(text)?.[0].length ?? 0;
  const stripped = text.replace(isJapanese(lang) ? JAPANESE_TERMINATORS : CHINESE_TERMINATORS, (matched, offset: number) => (lastContent >= offset + matched.length ? " " : ""));
  if (stripped === text) return text;
  return stripped
    .replace(REPEATED_SPACES, " ")
    .split("\n")
    .map((line) => line.trim())
    .join("\n");
}

function halveTerminators(text: string, lang: string): string {
  const pattern = isJapanese(lang) ? JAPANESE_FULL_TERMINATORS : CHINESE_FULL_TERMINATORS;
  return text.replace(pattern, (matched, offset: number) => FULL_TO_HALF[matched] + (needsSpaceAfter(text, offset + matched.length) ? " " : ""));
}

function halveExclaimQuestion(text: string): string {
  if (!text.includes("!") && !text.includes("?") && !FULL_WIDTH_RUN.test(text)) return text;
  return text.replace(EXCLAIM_QUESTION_RUN, (run, offset: number) => {
    const half = Array.from(run, (char) => FULL_TO_HALF[char] ?? char).join("");
    return needsSpaceAfter(text, offset + run.length) ? `${half} ` : half;
  });
}

export const supportsPunctuationStyle = (lang: string): boolean => isChineseLanguage(lang) || isJapanese(lang);

export function restylePunctuation(text: string, targetLang: string, style: PunctuationStyle = DEFAULT_PUNCTUATION_STYLE): string {
  if (!text) return text;
  const cjk = supportsPunctuationStyle(targetLang);
  const fullWidth = cjk && style.fullWidth;
  let styled = cjk ? styleEllipses(text, fullWidth) : text;
  if (cjk) styled = style.keepTerminators ? (fullWidth ? styled : halveTerminators(styled, targetLang)) : stripTerminators(styled, targetLang);
  return fullWidth ? styled : halveExclaimQuestion(styled);
}
