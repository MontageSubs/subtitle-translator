export interface Token {
  text: string;
  isWordLike: boolean;
}

function segmenterFor(locale: string): { segment(text: string): Iterable<{ segment: string; isWordLike?: boolean }> } | null {
  const ctor = (Intl as unknown as { Segmenter?: new (locale: string, opts: { granularity: string }) => any }).Segmenter;
  if (!ctor) return null;
  try {
    return new ctor(locale, { granularity: "word" });
  } catch {
    return null;
  }
}

export function segmentTokens(text: string, locale: string): Token[] {
  const segmenter = segmenterFor(locale) || segmenterFor("en");
  if (segmenter) {
    return Array.from(segmenter.segment(text), (s) => ({ text: s.segment, isWordLike: Boolean(s.isWordLike) }));
  }
  return text.split(/(\s+)/).filter(Boolean).map((chunk) => ({ text: chunk, isWordLike: !/^\s+$/.test(chunk) }));
}
