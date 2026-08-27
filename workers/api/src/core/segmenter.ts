export type SyncCutter = (text: string) => string[];

interface SegmenterAdapter {
  cut: SyncCutter;
  registerTerm?(term: string): void;
}

async function loadZhAdapter(): Promise<SegmenterAdapter | null> {
  try {
    const { Segment, useDefault } = await import("segmentit");
    const segment = useDefault(new Segment());
    return {
      cut: (text) => segment.doSegment(text).map((token) => token.w),
      registerTerm: (term) => { if (term) segment.loadDict(`${term}|${segment.POSTAG.D_N}|1000`); },
    };
  } catch (e) {
    console.warn("segmentit unavailable, falling back to punctuation boundaries:", e);
    return null;
  }
}

async function loadJaAdapter(): Promise<SegmenterAdapter | null> {
  try {
    const mod = await import("tiny-segmenter");
    const Ctor = mod.default;
    const instance = new Ctor();
    return { cut: (text) => instance.segment(text) };
  } catch (e) {
    console.warn("tiny-segmenter unavailable, falling back to punctuation boundaries:", e);
    return null;
  }
}

const ADAPTER_LOADERS: Record<string, () => Promise<SegmenterAdapter | null>> = {
  zh: loadZhAdapter,
  ja: loadJaAdapter,
};

const adapterCache = new Map<string, Promise<SegmenterAdapter | null>>();

function segmenterKey(langCode: string): string | null {
  const base = (langCode || "").split("-")[0].toLowerCase();
  return base in ADAPTER_LOADERS ? base : null;
}

function loadAdapter(key: string): Promise<SegmenterAdapter | null> {
  if (!adapterCache.has(key)) adapterCache.set(key, ADAPTER_LOADERS[key]());
  return adapterCache.get(key)!;
}

export async function getSyncCutter(targetLang: string): Promise<SyncCutter | null> {
  const key = segmenterKey(targetLang);
  if (!key) return null;
  const adapter = await loadAdapter(key);
  return adapter?.cut ?? null;
}

export async function registerGlossaryTerm(targetLang: string, term: string): Promise<void> {
  const key = segmenterKey(targetLang);
  if (!key) return;
  const adapter = await loadAdapter(key);
  adapter?.registerTerm?.(term);
}
