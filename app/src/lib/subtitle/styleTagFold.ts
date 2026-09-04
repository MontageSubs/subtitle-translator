const STYLE_TAG_JOIN_PATTERN = /<\/(i|b|u)>(\s*)<\1>/gi;

export function collapseAdjacentStyleWraps(text: string): string {
  return text.replace(STYLE_TAG_JOIN_PATTERN, "$2");
}

export function joinCueLines(text: string): string {
  return collapseAdjacentStyleWraps(text.replace(/\n/g, " ")).replace(/\s+/g, " ").trim();
}
