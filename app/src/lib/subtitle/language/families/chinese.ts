import { createLineBreakPolicy } from "../shared/breakScoring";
import { createSourceRules } from "../shared/sourceRules";
import { LanguageModule, OrthographyRule, WordCutter } from "../shared/types";

async function loadChineseWordCutter(): Promise<WordCutter | null> {
  try {
    const { Segment, useDefault } = await import("segmentit");
    const segment = useDefault(new Segment());
    return (text) => segment.doSegment(text).map((token) => token.w);
  } catch {
    return null;
  }
}

export function defineChineseLanguage(id: "zh-hans" | "zh-hant" | "yue", rule: OrthographyRule): LanguageModule {
  return {
    id,
    script: "cjk",
    source: createSourceRules(),
    target: {
      reading: { maxCharsPerLine: 18, speedCps: 9 },
      lineBreak: createLineBreakPolicy(rule, { countsCharacters: true, rewardsSpaceBoundary: true }),
      assFont: "Microsoft YaHei",
      alignsMusicToTop: true,
      loadWordCutter: id === "yue" ? undefined : loadChineseWordCutter,
    },
  };
}
