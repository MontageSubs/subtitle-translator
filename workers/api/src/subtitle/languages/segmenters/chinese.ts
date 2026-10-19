import { Segment, useDefault } from "segmentit";
import { reportFault } from "../../../logging/fault";
import type { WordCutter } from "../types";
import { withCharBudget } from "./charBudget";
import { reuseTokenizedSlices } from "./sliceReuse";

const EXACT_SEGMENTATION_CHAR_BUDGET = 100;

const nativeSegmenter = typeof Intl.Segmenter === "function" ? new Intl.Segmenter("zh", { granularity: "word" }) : null;

const cutNatively: WordCutter | null = nativeSegmenter && ((text) => Array.from(nativeSegmenter.segment(text), (part) => part.segment));

function createDictionaryCutter(): WordCutter | null {
  try {
    const segment = useDefault(new Segment());
    return (text) => segment.doSegment(text).map((token) => token.w);
  } catch (error) {
    reportFault("chinese_segmenter_unavailable", error);
    return null;
  }
}

const cutByDictionary = createDictionaryCutter();

export async function loadChineseCutter(): Promise<WordCutter | null> {
  if (!cutByDictionary || !cutNatively) return cutByDictionary ?? cutNatively;
  return withCharBudget(cutByDictionary, reuseTokenizedSlices(cutNatively), EXACT_SEGMENTATION_CHAR_BUDGET);
}
