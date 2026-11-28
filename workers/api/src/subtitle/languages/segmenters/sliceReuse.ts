import { bisectLeft } from "../../merge/numeric";
import type { WordCutter } from "../types";

export function reuseTokenizedSlices(cut: WordCutter): WordCutter {
  let source = "";
  let tokens: string[] = [];
  let offsets: number[] = [];

  const remember = (text: string, words: string[]): void => {
    source = text;
    tokens = words;
    offsets = [0];
    let offset = 0;
    for (const word of words) offsets.push((offset += word.length));
  };

  const tokenAt = (offset: number): number | undefined => {
    const index = bisectLeft(offsets, offset);
    return offsets[index] === offset ? index : undefined;
  };

  return (text) => {
    const start = source.indexOf(text);
    const first = start < 0 ? undefined : tokenAt(start);
    const last = start < 0 ? undefined : tokenAt(start + text.length);
    if (first !== undefined && last !== undefined) return tokens.slice(first, last);
    const words = cut(text);
    if (text.length >= source.length || start < 0) remember(text, words);
    return words;
  };
}
