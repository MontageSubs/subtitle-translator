import { reportFault } from "../../../logging/fault";
import type { WordCutter } from "../types";
import { reuseTokenizedSlices } from "./sliceReuse";

export function createNativeCutterLoader(locale: string, faultLabel: string): () => Promise<WordCutter | null> {
  const segmenter = typeof Intl.Segmenter === "function" ? new Intl.Segmenter(locale, { granularity: "word" }) : null;
  if (!segmenter) reportFault(faultLabel, new Error("Intl.Segmenter is not available"));
  return async () => (segmenter ? reuseTokenizedSlices((text) => Array.from(segmenter.segment(text), (part) => part.segment)) : null);
}
