import { reportFault } from "../../../logging/fault";
import type { WordCutter } from "../types";

let pending: Promise<WordCutter | null> | undefined;

export function loadJapaneseCutter(): Promise<WordCutter | null> {
  pending ??= import("tiny-segmenter")
    .then((module) => {
      const instance = new module.default();
      return ((text) => instance.segment(text)) as WordCutter;
    })
    .catch((error) => {
      reportFault("japanese_segmenter_unavailable", error);
      return null;
    });
  return pending;
}
