const STYLE_TAG_PATTERN = /<\/?(i|b|u)>/gi;
const STYLE_TAG_TEST_PATTERN = /<\/?(i|b|u)>/i;
const DANGLING_OPEN_PATTERN = /<(i|b|u)(?![a-zA-Z>])/gi;
const MISSING_OPEN_BRACKET_PATTERN = /(?<!<)\/(i|b|u)>/gi;

function repairStyleTags(text: string): string {
  return text
    .replace(DANGLING_OPEN_PATTERN, (_, tag: string) => `</${tag.toLowerCase()}>`)
    .replace(MISSING_OPEN_BRACKET_PATTERN, (_, tag: string) => `</${tag.toLowerCase()}>`);
}

function areStyleTagsBalanced(text: string): boolean {
  const depth: Record<string, number> = { i: 0, b: 0, u: 0 };
  for (const match of text.matchAll(STYLE_TAG_PATTERN)) {
    const token = match[0].toLowerCase();
    const tag = token.replace(/[</>]/g, "");
    depth[tag]! += token[1] === "/" ? -1 : 1;
    if (depth[tag]! < 0) return false;
  }
  return depth.i === 0 && depth.b === 0 && depth.u === 0;
}

export function sanitizeStyleTags(text: string): string {
  if (!STYLE_TAG_TEST_PATTERN.test(text)) return text;
  const repaired = repairStyleTags(text);
  return areStyleTagsBalanced(repaired) ? repaired : repaired.replace(STYLE_TAG_PATTERN, "");
}
