import { hasStyleTag } from "../../../subtitle/styleTags";
import { dropUnbalancedStyleTags } from "../../engine/styleBalance";

interface EscapeRule {
  open: RegExp;
  close: RegExp;
  openToken: string;
  closeToken: string;
}

const escapeRule = (tag: string): EscapeRule => ({
  open: new RegExp(`<${tag}\\b`, "gi"),
  close: new RegExp(`</${tag}>`, "gi"),
  openToken: `\u27e6${tag}\u27e7`,
  closeToken: `\u27e6/${tag}\u27e7`,
});

const ESCAPE_RULES: readonly EscapeRule[] = ["b", "i", "u"].map(escapeRule);

const WHITESPACE_PATTERN = /\s/;
const isSpace = (text: string, index: number): boolean => WHITESPACE_PATTERN.test(text[index] ?? "");

function replaceTagSpans(text: string, pattern: RegExp, token: string, hasAttributes: boolean): string {
  let result = "";
  let copied = 0;
  pattern.lastIndex = 0;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    let end = pattern.lastIndex;
    if (hasAttributes) {
      const close = text.indexOf(">", end);
      if (close === -1) break;
      end = close + 1;
    }
    let start = match.index;
    while (start > copied && isSpace(text, start - 1)) start--;
    while (isSpace(text, end)) end++;
    result += text.slice(copied, start) + token;
    copied = end;
    pattern.lastIndex = end;
  }
  return copied === 0 ? text : result + text.slice(copied);
}

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

export function escapeFormattingTags(text: string): string {
  if (!text.includes("<")) return text;
  let result = text;
  for (const { open, close, openToken, closeToken } of ESCAPE_RULES) {
    result = replaceTagSpans(replaceTagSpans(result, open, openToken, true), close, closeToken, false);
  }
  return result;
}

export function restoreFormattingTags(text: string): string {
  if (!text.includes("\u27e6") && !text.includes("\u27e7")) return text;
  const repaired = text
    .replace(MISSING_OPEN_PATTERN, (_, tag: string) => `\u27e6/${tag.toLowerCase()}\u27e7`)
    .replace(MISSING_CLOSE_PATTERN, (_, tag: string) => `\u27e6${tag.toLowerCase()}\u27e7`);
  return applyRules(repaired, RESTORE_RULES);
}

export const sanitizeStyleTags = (text: string): string => (hasStyleTag(text) ? dropUnbalancedStyleTags(text) : text);
