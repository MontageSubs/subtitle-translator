const ESCAPE_RULES: readonly (readonly [RegExp, string])[] = [
  [/\s*<b\b[^>]*>\s*/gi, "\u27e6b\u27e7"],
  [/\s*<\/b>\s*/gi, "\u27e6/b\u27e7"],
  [/\s*<i\b[^>]*>\s*/gi, "\u27e6i\u27e7"],
  [/\s*<\/i>\s*/gi, "\u27e6/i\u27e7"],
];

const RESTORE_RULES: readonly (readonly [RegExp, string])[] = [
  [/\u27e6\s*b\s*\u27e7/gi, "<b>"],
  [/\u27e6\s*\/\s*b\s*\u27e7/gi, "</b>"],
  [/\u27e6\s*i\s*\u27e7/gi, "<i>"],
  [/\u27e6\s*\/\s*i\s*\u27e7/gi, "</i>"],
];

const MISSING_OPEN_PATTERN = /(?<!\u27e6)\/(b|i)\u27e7/gi;
const MISSING_CLOSE_PATTERN = /\u27e6(b|i)(?!\u27e7)/gi;
const STYLE_TAG_PATTERN = /<\/?(b|i)>/gi;
const STYLE_TAG_TEST_PATTERN = /<\/?(b|i)>/i;

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

function areStyleTagsBalanced(text: string): boolean {
  let bold = 0;
  let italic = 0;
  for (const match of text.matchAll(STYLE_TAG_PATTERN)) {
    const token = match[0].toLowerCase();
    const step = token[1] === "/" ? -1 : 1;
    if (token.includes("b")) bold += step;
    else italic += step;
    if (bold < 0 || italic < 0) return false;
  }
  return bold === 0 && italic === 0;
}

export function sanitizeStyleTags(text: string): string {
  if (!STYLE_TAG_TEST_PATTERN.test(text)) return text;
  return areStyleTagsBalanced(text) ? text : text.replace(STYLE_TAG_PATTERN, "");
}
