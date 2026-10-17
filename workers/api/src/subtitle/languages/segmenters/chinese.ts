import { reportFault } from "../../../logging/fault";
import type { WordCutter } from "../types";

let pending: Promise<WordCutter | null> | undefined;

export function loadChineseCutter(): Promise<WordCutter | null> {
  pending ??= import("segmentit")
    .then(({ Segment, useDefault }) => {
      const segment = useDefault(new Segment());
      return ((text) => segment.doSegment(text).map((token) => token.w)) as WordCutter;
    })
    .catch((error) => {
      reportFault("chinese_segmenter_unavailable", error);
      return null;
    });
  return pending;
}
