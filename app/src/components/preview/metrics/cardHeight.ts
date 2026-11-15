import { isCompactLayout } from "../../../utils/compactLayout";
import { stripMarkup } from "../../../lib/subtitle/common/markup";
import { PreviewCard } from "../types";

export const MIN_CARD_HEIGHT = 76;
const MIN_CHARS_PER_LINE = 12;
const PX_PER_CHAR_DESKTOP = 17;
const PX_PER_CHAR_MOBILE = 15;
const CARD_CHROME_HEIGHT = 40;
const REASON_HEIGHT = 22;
const SOURCE_LINE_HEIGHT = 18;
const SOURCE_PADDING = 3;
const TARGET_LINE_HEIGHT = 21;
const TARGET_PADDING = 6;

function countLines(text: string, charsPerLine: number): number {
  if (!text) return 1;
  const total = text.split(/\r?\n/).reduce((sum, line) => sum + Math.max(1, Math.ceil(stripMarkup(line).trim().length / charsPerLine)), 0);
  return Math.max(1, total);
}

export function charsPerLineFor(hostWidth: number): number {
  const pxPerChar = isCompactLayout() ? PX_PER_CHAR_MOBILE : PX_PER_CHAR_DESKTOP;
  return Math.max(MIN_CHARS_PER_LINE, Math.round(hostWidth / pxPerChar));
}

export function estimateCardHeight(card: PreviewCard, target: string, hasReason: boolean, charsPerLine: number): number {
  const height = CARD_CHROME_HEIGHT
    + (hasReason ? REASON_HEIGHT : 0)
    + countLines(card.source, charsPerLine) * SOURCE_LINE_HEIGHT + SOURCE_PADDING
    + countLines(target, charsPerLine) * TARGET_LINE_HEIGHT + TARGET_PADDING;
  return Math.max(MIN_CARD_HEIGHT, Math.ceil(height));
}
