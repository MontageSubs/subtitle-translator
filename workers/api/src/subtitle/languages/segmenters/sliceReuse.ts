import type { WordCutter } from "../types";

export function reuseTokenizedSlices(cut: WordCutter): WordCutter {
  let source = "";
  let tokens: string[] = [];
  let offsetIndex = new Map<number, number>();

  const remember = (text: string, words: string[]): void => {
    source = text;
    tokens = words;
    offsetIndex = new Map();
    let offset = 0;
    words.forEach((word, index) => {
      offsetIndex.set(offset, index);
      offset += word.length;
    });
    offsetIndex.set(offset, words.length);
  };

  return (text) => {
    const start = source.indexOf(text);
    const first = start < 0 ? undefined : offsetIndex.get(start);
    const last = start < 0 ? undefined : offsetIndex.get(start + text.length);
    if (first !== undefined && last !== undefined) return tokens.slice(first, last);
    const words = cut(text);
    if (text.length >= source.length || start < 0) remember(text, words);
    return words;
  };
}
