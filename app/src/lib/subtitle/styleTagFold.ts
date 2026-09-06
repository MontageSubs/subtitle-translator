const STYLE_TAG_JOIN_PATTERN = /<\/(i|b|u)>(\s*)<\1>/gi;
const POSITION_TAG_PATTERN = /\{\\an[1-9]\}/g;

export function collapseAdjacentStyleWraps(text: string): string {
  return text.replace(STYLE_TAG_JOIN_PATTERN, "$2");
}

export function joinCueLines(text: string): string {
  return collapseAdjacentStyleWraps(text.replace(/\n/g, " ")).replace(/\s+/g, " ").trim();
}

export function cleanPositionTags(raw: string): string {
  return raw.replace(POSITION_TAG_PATTERN, "").trim();
}

export function resolveDisplayOriginal(cueText: string | undefined, originalText: string | undefined, hasTranslation: boolean): string {
  const raw = (hasTranslation ? (cueText || originalText) : (originalText || cueText)) || "";
  return joinCueLines(cleanPositionTags(raw));
}
