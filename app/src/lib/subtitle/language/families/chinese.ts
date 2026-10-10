import { CHINESE_ORTHOGRAPHY } from "../../common/chineseOrthography";
import { createLineBreakPolicy } from "../shared/breakScoring";
import { createSourceRules } from "../shared/sourceRules";
import { createOrthographyRule } from "../shared/orthography";
import { LanguageModule, WordCutter } from "../shared/types";

async function loadChineseWordCutter(): Promise<WordCutter | null> {
  try {
    const { Segment, useDefault } = await import("segmentit");
    const segment = useDefault(new Segment());
    return (text) => segment.doSegment(text).map((token) => token.w);
  } catch {
    return null;
  }
}

export function defineChineseLanguage(id: "zh-hans" | "zh-hant" | "yue"): LanguageModule {
  const { proclitics, enclitics, conjunctions } = CHINESE_ORTHOGRAPHY[id];
  const rule = createOrthographyRule(proclitics, enclitics, conjunctions);
  return {
    id,
    script: "cjk",
    source: createSourceRules(),
    target: {
      lineBreak: createLineBreakPolicy(rule, { countsCharacters: true, rewardsSpaceBoundary: true }),
      assFont: "Microsoft YaHei",
      alignsMusicToTop: true,
      loadWordCutter: id === "yue" ? undefined : loadChineseWordCutter,
    },
  };
}
