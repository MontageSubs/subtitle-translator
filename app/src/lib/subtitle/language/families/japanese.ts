import { createLineBreakPolicy } from "../shared/breakScoring";
import { LanguageModule, OrthographyRule, WordCutter } from "../shared/types";

async function loadJapaneseWordCutter(): Promise<WordCutter | null> {
  try {
    const { default: TinySegmenter } = await import("tiny-segmenter");
    const segmenter = new TinySegmenter();
    return (text) => segmenter.segment(text);
  } catch {
    return null;
  }
}

export function defineJapaneseLanguage(code: "ja", rule: OrthographyRule): LanguageModule {
  return {
    id: code,
    baseCode: code,
    script: "cjk",
    reading: { maxCharsPerLine: 18, speedCps: 9 },
    bilingualWithChineseByDefault: true,
    assFont: "Yu Gothic",
    lineBreak: createLineBreakPolicy(rule, { countsCharacters: true, rewardsSpaceBoundary: false }),
    loadWordCutter: loadJapaneseWordCutter,
  };
}
