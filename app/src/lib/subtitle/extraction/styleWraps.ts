const ADJACENT_STYLE_WRAP_PATTERN = /<\/(i|b|u)>(\s*)<\1>/gi;

function collapseAdjacentStyleWraps(text: string): string {
  return text.replace(ADJACENT_STYLE_WRAP_PATTERN, "$2");
}

export function joinCueLines(text: string): string {
  return collapseAdjacentStyleWraps(text.replace(/\n/g, " ")).replace(/\s+/g, " ").trim();
}
