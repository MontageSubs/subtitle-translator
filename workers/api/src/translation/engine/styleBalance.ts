import { STYLE_TAG_PATTERN } from "../../subtitle/common/markup";

export function areStyleTagsBalanced(text: string): boolean {
  const depth: Record<string, number> = { i: 0, b: 0, u: 0 };
  for (const match of text.matchAll(STYLE_TAG_PATTERN)) {
    const token = match[0].toLowerCase();
    const tag = token.replace(/[</>]/g, "");
    depth[tag]! += token[1] === "/" ? -1 : 1;
    if (depth[tag]! < 0) return false;
  }
  return depth.i === 0 && depth.b === 0 && depth.u === 0;
}

export const dropUnbalancedStyleTags = (text: string): string =>
  areStyleTagsBalanced(text) ? text : text.replace(STYLE_TAG_PATTERN, "");
