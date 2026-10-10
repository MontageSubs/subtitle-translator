import { createLineBreakPolicy } from "../shared/breakScoring";
import { createSourceRules } from "../shared/sourceRules";
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
    script: "cjk",
    source: createSourceRules({ bilingualWithChineseByDefault: true }),
    target: {
      lineBreak: createLineBreakPolicy(rule, { countsCharacters: true, rewardsSpaceBoundary: false }),
      assFont: "Yu Gothic",
      alignsMusicToTop: true,
      loadWordCutter: loadJapaneseWordCutter,
    },
  };
}
