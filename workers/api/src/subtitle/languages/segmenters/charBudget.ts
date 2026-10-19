import type { WordCutter } from "../types";

export function withCharBudget(exact: WordCutter, approximate: WordCutter, maxChars: number): WordCutter {
  let remaining = maxChars;
  let exhausted = false;
  return (text) => {
    exhausted ||= text.length > remaining;
    if (exhausted) return approximate(text);
    remaining -= text.length;
    return exact(text);
  };
}
