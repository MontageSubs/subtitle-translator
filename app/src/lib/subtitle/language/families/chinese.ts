import { createLineBreakPolicy } from "../shared/breakScoring";
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
  const isMandarin = id !== "yue";
  return {
    id,
    baseCode: isMandarin ? "zh" : id,
    script: "cjk",
    reading: { maxCharsPerLine: 18, speedCps: 9 },
    bilingualWithChineseByDefault: false,
    assFont: "Microsoft YaHei",
    lineBreak: createLineBreakPolicy(rule, { countsCharacters: true, rewardsSpaceBoundary: true }),
    loadWordCutter: isMandarin ? loadChineseWordCutter : undefined,
  };
}
