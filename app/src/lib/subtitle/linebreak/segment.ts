export interface Token {
  text: string;
  isWordLike: boolean;
}

type SyncCutter = (text: string) => string[];

async function loadZhAdapter(): Promise<SyncCutter | null> {
  try {
    const { Segment, useDefault } = await import("segmentit");
    const segment = useDefault(new Segment());
    return (text) => segment.doSegment(text).map((token) => token.w);
  } catch (e) {
    console.warn("segmentit unavailable, falling back to Intl.Segmenter:", e);
    return null;
  }
}

async function loadJaAdapter(): Promise<SyncCutter | null> {
  try {
    const mod = await import("tiny-segmenter");
    const Ctor = mod.default;
    const instance = new Ctor();
    return (text) => instance.segment(text);
  } catch (e) {
    console.warn("tiny-segmenter unavailable, falling back to Intl.Segmenter:", e);
    return null;
  }
}

const DICTIONARY_LOADERS: Record<string, () => Promise<SyncCutter | null>> = {
  zh: loadZhAdapter,
  ja: loadJaAdapter,
};

const resolvedCutters = new Map<string, SyncCutter | null>();
const pendingLoads = new Map<string, Promise<void>>();

function dictionaryKey(langCode: string): string | null {
  const base = (langCode || "").split("-")[0].toLowerCase();
  return base in DICTIONARY_LOADERS ? base : null;
}

export function preloadLineBreakSegmenter(langCode: string): void {
  const key = dictionaryKey(langCode);
  if (!key || resolvedCutters.has(key) || pendingLoads.has(key)) return;
  pendingLoads.set(
    key,
    DICTIONARY_LOADERS[key]().then((cutter) => {
      resolvedCutters.set(key, cutter);
      pendingLoads.delete(key);
    })
  );
}

function isWordLikeToken(text: string): boolean {
  return /[\p{L}\p{N}]/u.test(text);
}

function intlSegmentTokens(text: string, locale: string): Token[] {
  const ctor = (Intl as unknown as { Segmenter?: new (locale: string, opts: { granularity: string }) => any }).Segmenter;
  if (ctor) {
    try {
      const segmenter = new ctor(locale, { granularity: "word" });
      return Array.from(segmenter.segment(text), (s: any) => ({ text: s.segment, isWordLike: Boolean(s.isWordLike) }));
    } catch {
      // unsupported locale, fall through to whitespace split below
    }
  }
  return text.split(/(\s+)/).filter(Boolean).map((chunk) => ({ text: chunk, isWordLike: !/^\s+$/.test(chunk) }));
}

export function segmentTokens(text: string, langCode: string): Token[] {
  const key = dictionaryKey(langCode);
  const cutter = key ? resolvedCutters.get(key) : undefined;
  if (!cutter) {
    if (key && !resolvedCutters.has(key)) preloadLineBreakSegmenter(langCode);
    return intlSegmentTokens(text, langCode);
  }
  return cutter(text).map((chunk) => ({ text: chunk, isWordLike: isWordLikeToken(chunk) }));
}
