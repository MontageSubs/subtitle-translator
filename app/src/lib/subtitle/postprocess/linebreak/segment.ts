import { targetRulesFor } from "../../language/resolve";
import { WordCutter } from "../../language/shared/types";

type WordCutterLoader = () => Promise<WordCutter | null>;

export interface Token {
  text: string;
  isWordLike: boolean;
}

const intlSegmenters = new Map<string, Intl.Segmenter | null>();
const loadedCutters = new Map<WordCutterLoader, WordCutter | null>();
const pendingLoads = new Set<WordCutterLoader>();

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
  const { loadWordCutter } = targetRulesFor(langCode);
  if (!loadWordCutter || intlSegmenterFor(langCode) || loadedCutters.has(loadWordCutter) || pendingLoads.has(loadWordCutter)) return;
  pendingLoads.add(loadWordCutter);
  void loadWordCutter().then((cutter) => {
    loadedCutters.set(loadWordCutter, cutter);
    pendingLoads.delete(loadWordCutter);
  });
}

export function segmentTokens(text: string, langCode: string): Token[] {
  const segmenter = intlSegmenterFor(langCode);
  if (segmenter) {
    return Array.from(segmenter.segment(text), (part) => ({ text: part.segment, isWordLike: Boolean(part.isWordLike) }));
  }

  const { loadWordCutter } = targetRulesFor(langCode);
  const cutter = loadWordCutter && loadedCutters.get(loadWordCutter);
  if (cutter) return cutter(text).map((chunk) => ({ text: chunk, isWordLike: isWordLike(chunk) }));
  if (loadWordCutter) preloadLineBreakSegmenter(langCode);

  return text.split(/(\s+)/).filter(Boolean).map((chunk) => ({
    text: chunk,
    isWordLike: !/^\s+$/.test(chunk) && isWordLike(chunk),
  }));
}
