import { hasStyleTag } from "../../../subtitle/styleTags";
import { dropUnbalancedStyleTags } from "../../engine/styleBalance";

const ESCAPE_RULES: readonly (readonly [RegExp, string])[] = [
  [/\s*<b\b[^>]*>\s*/gi, "\u27e6b\u27e7"],
  [/\s*<\/b>\s*/gi, "\u27e6/b\u27e7"],
  [/\s*<i\b[^>]*>\s*/gi, "\u27e6i\u27e7"],
  [/\s*<\/i>\s*/gi, "\u27e6/i\u27e7"],
  [/\s*<u\b[^>]*>\s*/gi, "\u27e6u\u27e7"],
  [/\s*<\/u>\s*/gi, "\u27e6/u\u27e7"],
];

const RESTORE_RULES: readonly (readonly [RegExp, string])[] = [
  [/\u27e6\s*b\s*\u27e7/gi, "<b>"],
  [/\u27e6\s*\/\s*b\s*\u27e7/gi, "</b>"],
  [/\u27e6\s*i\s*\u27e7/gi, "<i>"],
  [/\u27e6\s*\/\s*i\s*\u27e7/gi, "</i>"],
  [/\u27e6\s*u\s*\u27e7/gi, "<u>"],
  [/\u27e6\s*\/\s*u\s*\u27e7/gi, "</u>"],
];

const MISSING_OPEN_PATTERN = /(?<!\u27e6)\/(b|i|u)\u27e7/gi;
const MISSING_CLOSE_PATTERN = /\u27e6(b|i|u)(?!\u27e7)/gi;

const applyRules = (text: string, rules: readonly (readonly [RegExp, string])[]): string =>
  rules.reduce((result, [pattern, replacement]) => result.replace(pattern, replacement), text);

export const escapeFormattingTags = (text: string): string => (text ? applyRules(text, ESCAPE_RULES) : text);

export function restoreFormattingTags(text: string): string {
  if (!text) return text;
  const repaired = text
    .replace(MISSING_OPEN_PATTERN, (_, tag: string) => `\u27e6/${tag.toLowerCase()}\u27e7`)
    .replace(MISSING_CLOSE_PATTERN, (_, tag: string) => `\u27e6${tag.toLowerCase()}\u27e7`);
  return applyRules(repaired, RESTORE_RULES);
}

export const sanitizeStyleTags = (text: string): string => (hasStyleTag(text) ? dropUnbalancedStyleTags(text) : text);
