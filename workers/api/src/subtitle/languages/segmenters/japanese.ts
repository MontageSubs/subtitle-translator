import type { WordCutter } from "../types";

let pending: Promise<WordCutter | null> | undefined;

export function loadJapaneseCutter(): Promise<WordCutter | null> {
  pending ??= import("tiny-segmenter")
    .then((module) => {
      const instance = new module.default();
      return ((text) => instance.segment(text)) as WordCutter;
    })
    .catch((error) => {
      console.warn("tiny-segmenter unavailable, falling back to punctuation boundaries:", error);
      return null;
    });
  return pending;
}
