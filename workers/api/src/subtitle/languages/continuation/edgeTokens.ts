const WINDOW = 8;
const CACHE_LIMIT = 1024;

export interface EdgeTokenizer {
  first(text: string, index: number): string;
  last(text: string, end: number): string;
}

export function createEdgeTokenizer(locale: string): EdgeTokenizer {
  const segmenter = typeof Intl.Segmenter === "function" ? new Intl.Segmenter(locale, { granularity: "word" }) : null;
  const cache = new Map<string, readonly string[]>();

  const tokensOf = (window: string): readonly string[] => {
    let tokens = cache.get(window);
    if (!tokens) {
      tokens = segmenter ? Array.from(segmenter.segment(window), (part) => part.segment) : Array.from(window);
      if (cache.size >= CACHE_LIMIT) cache.clear();
      cache.set(window, tokens);
    }
    return tokens;
  };

  return {
    first: (text, index) => tokensOf(text.slice(index, index + WINDOW))[0] ?? "",
    last: (text, end) => tokensOf(text.slice(Math.max(0, end - WINDOW), end)).at(-1) ?? "",
  };
}
