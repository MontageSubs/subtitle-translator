import { preloadLanguageRule } from "./registry";

export interface Token {
  text: string;
  isWordLike: boolean;
}

type SyncCutter = (text: string) => string[];

const segmenterCache = new Map<string, Intl.Segmenter | null>();

function getIntlSegmenter(locale: string): Intl.Segmenter | null {
  if (typeof Intl === "undefined" || !("Segmenter" in Intl)) return null;
  const key = (locale || "en").toLowerCase().trim();
  if (segmenterCache.has(key)) return segmenterCache.get(key)!;
  try {
    const segmenter = new Intl.Segmenter(locale, { granularity: "word" });
    segmenterCache.set(key, segmenter);
    return segmenter;
  } catch {
    segmenterCache.set(key, null);
    return null;
  }
}

async function loadZhAdapter(): Promise<SyncCutter | null> {
  try {
    const { Segment, useDefault } = await import("segmentit");
    const segment = useDefault(new Segment());
    return (text) => segment.doSegment(text).map((token) => token.w);
  } catch {
    return null;
  }
}

async function loadJaAdapter(): Promise<SyncCutter | null> {
  try {
    const mod = await import("tiny-segmenter");
    const Ctor = mod.default;
    const instance = new Ctor();
    return (text) => instance.segment(text);
  } catch {
    return null;
  }
}

const FALLBACK_LOADERS: Record<string, () => Promise<SyncCutter | null>> = {
  zh: loadZhAdapter,
  ja: loadJaAdapter,
};

const resolvedFallbackCutters = new Map<string, SyncCutter | null>();
const pendingLoads = new Map<string, Promise<void>>();

function dictionaryKey(langCode: string): string | null {
  const normalized = (langCode || "").toLowerCase().trim();
  if (normalized.startsWith("zh")) {
    return "zh";
  }
  if (normalized.startsWith("ja")) {
    return "ja";
  }
  return null;
}

export function preloadLineBreakSegmenter(langCode: string): void {
  preloadLanguageRule(langCode);
  if (getIntlSegmenter(langCode)) return;
  const key = dictionaryKey(langCode);
  if (!key || resolvedFallbackCutters.has(key) || pendingLoads.has(key)) return;
  pendingLoads.set(
    key,
    FALLBACK_LOADERS[key]().then((cutter) => {
      resolvedFallbackCutters.set(key, cutter);
      pendingLoads.delete(key);
    })
  );
}

function isWordLikeToken(text: string): boolean {
  return /[\p{L}\p{N}]/u.test(text);
}

export function segmentTokens(text: string, langCode: string): Token[] {
  const segmenter = getIntlSegmenter(langCode);
  if (segmenter) {
    return Array.from(segmenter.segment(text), (s) => ({
      text: s.segment,
      isWordLike: Boolean(s.isWordLike),
    }));
  }

  const key = dictionaryKey(langCode);
  const fallback = key ? resolvedFallbackCutters.get(key) : undefined;
  if (fallback) {
    return fallback(text).map((chunk) => ({
      text: chunk,
      isWordLike: isWordLikeToken(chunk),
    }));
  }

  if (key && !resolvedFallbackCutters.has(key)) {
    preloadLineBreakSegmenter(langCode);
  }

  return text.split(/(\s+)/).filter(Boolean).map((chunk) => ({
    text: chunk,
    isWordLike: !/^\s+$/.test(chunk) && isWordLikeToken(chunk),
  }));
}
