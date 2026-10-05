import { joinCueLines } from "../extraction/styleWraps";

const POSITION_TAG_PATTERN = /\{\\an[1-9]\}/g;

export function cleanPositionTags(raw: string): string {
  return raw.replace(POSITION_TAG_PATTERN, "").trim();
}

export function resolveDisplayOriginal(cueText: string | undefined, originalText: string | undefined, hasTranslation: boolean): string {
  const raw = (hasTranslation ? cueText || originalText : originalText || cueText) || "";
  return joinCueLines(cleanPositionTags(raw));
}
