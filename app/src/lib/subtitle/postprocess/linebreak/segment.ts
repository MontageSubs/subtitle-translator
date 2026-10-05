import { resolveLanguage } from "../../language/resolve";
import { WordCutter } from "../../language/shared/types";

export interface Token {
  text: string;
  isWordLike: boolean;
}

const intlSegmenters = new Map<string, Intl.Segmenter | null>();
const loadedCutters = new Map<string, WordCutter | null>();
const pendingLoads = new Set<string>();

function intlSegmenterFor(locale: string): Intl.Segmenter | null {
  if (typeof Intl === "undefined" || !("Segmenter" in Intl)) return null;
  const key = (locale || "en").toLowerCase().trim();
  if (!intlSegmenters.has(key)) {
    try {
      intlSegmenters.set(key, new Intl.Segmenter(locale, { granularity: "word" }));
    } catch {
      intlSegmenters.set(key, null);
    }
  }
  return intlSegmenters.get(key)!;
}

function isWordLike(text: string): boolean {
  return /[\p{L}\p{N}]/u.test(text);
}

export function preloadLineBreakSegmenter(langCode: string): void {
  const { baseCode, loadWordCutter } = resolveLanguage(langCode);
  if (!loadWordCutter || intlSegmenterFor(langCode) || loadedCutters.has(baseCode) || pendingLoads.has(baseCode)) return;
  pendingLoads.add(baseCode);
  void loadWordCutter().then((cutter) => {
    loadedCutters.set(baseCode, cutter);
    pendingLoads.delete(baseCode);
  });
}

export function segmentTokens(text: string, langCode: string): Token[] {
  const segmenter = intlSegmenterFor(langCode);
  if (segmenter) {
    return Array.from(segmenter.segment(text), (part) => ({ text: part.segment, isWordLike: Boolean(part.isWordLike) }));
  }

  const { baseCode, loadWordCutter } = resolveLanguage(langCode);
  const cutter = loadedCutters.get(baseCode);
  if (cutter) return cutter(text).map((chunk) => ({ text: chunk, isWordLike: isWordLike(chunk) }));
  if (loadWordCutter) preloadLineBreakSegmenter(langCode);

  return text.split(/(\s+)/).filter(Boolean).map((chunk) => ({
    text: chunk,
    isWordLike: !/^\s+$/.test(chunk) && isWordLike(chunk),
  }));
}
