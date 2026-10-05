import { MOBILE_MEDIA_QUERY } from "../../../config/breakpoints";
import { stripSubtitleTags } from "../../../lib/subtitle/postprocess/lineMetrics";
import { PreviewCard } from "../types";

export const MIN_CARD_HEIGHT = 76;
const CHARS_PER_LINE_DESKTOP = 42;
const CHARS_PER_LINE_MOBILE = 25;
const CARD_CHROME_HEIGHT = 40;
const REASON_HEIGHT = 22;
const SOURCE_LINE_HEIGHT = 18;
const SOURCE_PADDING = 3;
const TARGET_LINE_HEIGHT = 21;
const TARGET_PADDING = 6;

function countLines(text: string, charsPerLine: number): number {
  if (!text) return 1;
  const total = text.split(/\r?\n/).reduce((sum, line) => sum + Math.max(1, Math.ceil(stripSubtitleTags(line).trim().length / charsPerLine)), 0);
  return Math.max(1, total);
}

export function estimateCardHeight(card: PreviewCard, target: string, hasReason: boolean): number {
  const mobile = typeof window !== "undefined" && window.matchMedia(MOBILE_MEDIA_QUERY).matches;
  const charsPerLine = mobile ? CHARS_PER_LINE_MOBILE : CHARS_PER_LINE_DESKTOP;
  const height = CARD_CHROME_HEIGHT
    + (hasReason ? REASON_HEIGHT : 0)
    + countLines(card.source, charsPerLine) * SOURCE_LINE_HEIGHT + SOURCE_PADDING
    + countLines(target, charsPerLine) * TARGET_LINE_HEIGHT + TARGET_PADDING;
  return Math.max(MIN_CARD_HEIGHT, Math.ceil(height));
}
