import { SELECTABLE_LANGUAGE_CODES } from "./languageProfiles";
import { detectInWorker, warmDetectorChannel } from "./detectChannel";
import type { DetectionResult } from "./detectProtocol";
import { canonicalTag } from "./providerLanguages";

const SAMPLE_MAX_CHARS = 2000;
const SAMPLE_START_RATIO = 0.05;
const BRACKETED_TEXT = /\([^)]*\)|\[[^\]]*\]|\{[^}]*\}|<[^>]*>|（[^）]*）|［[^］]*］|｛[^｝]*｝|【[^】]*】|〔[^〕]*〕|〖[^〗]*〗|〘[^〙]*〙|〚[^〛]*〛|⟨[^⟩]*⟩|﹙[^﹚]*﹚|﹝[^﹞]*﹞/g;
const MUSIC_SYMBOLS = /[♪♫♬♩♭♯𝅘𝅥𝅮🎵🎶🎼]+/gu;
const TYPESETTING_TAGS = /\\(?:move|i?clip|org)\b/;
const LETTER = /\p{L}/u;

export interface DetectionCue {
  text: string;
  assTags?: ReadonlyArray<readonly [number, string]>;
}

const isTypesetting = (cue: DetectionCue): boolean => cue.assTags?.some(([, tags]) => TYPESETTING_TAGS.test(tags)) ?? false;

const spokenTextOf = (text: string): string =>
  text.replace(BRACKETED_TEXT, " ").replace(MUSIC_SYMBOLS, " ").replace(/\s+/g, " ").trim();

export function detectionSampleOf(cues: readonly DetectionCue[]): string {
  const spoken = cues.filter((cue) => !isTypesetting(cue)).map((cue) => spokenTextOf(cue.text)).filter((text) => LETTER.test(text));
  const start = Math.floor(spoken.length * SAMPLE_START_RATIO);
  let sample = "";
  let tail = start;
  while (tail < spoken.length && sample.length < SAMPLE_MAX_CHARS) sample += `${sample ? " " : ""}${spoken[tail++]}`;
  let head = start;
  while (head > 0 && sample.length < SAMPLE_MAX_CHARS) sample = `${spoken[--head]} ${sample}`;
  return sample.slice(0, SAMPLE_MAX_CHARS).trim();
}

export type { DetectionResult } from "./detectProtocol";

async function detectOnMainThread(texts: readonly string[]): Promise<(DetectionResult | null)[]> {
  const { eld } = await import("eld/small");
  return texts.map((text) => {
    const result = eld.detect(text);
    return result.language ? { code: result.language, reliable: result.isReliable() } : null;
  });
}

const detectTexts = (texts: readonly string[]): Promise<(DetectionResult | null)[]> => detectInWorker(texts).catch(() => detectOnMainThread(texts));

export async function detectSourceLanguage(cues: readonly DetectionCue[]): Promise<DetectionResult | null> {
  const sample = detectionSampleOf(cues);
  if (!sample) return null;
  const [result] = await detectTexts([sample]);
  return result ?? null;
}

export async function detectTextLanguages(texts: readonly string[]): Promise<(DetectionResult | null)[]> {
  const spoken = texts.map(spokenTextOf);
  const detectable = spoken.map((text, index) => (LETTER.test(text) ? index : -1)).filter((index) => index >= 0);
  const detected = await detectTexts(detectable.map((index) => spoken[index]!));
  const results: (DetectionResult | null)[] = spoken.map(() => null);
  detectable.forEach((index, position) => { results[index] = detected[position] ?? null; });
  return results;
}

export const warmLanguageDetector = warmDetectorChannel;

export function isKnownSourceLanguage(code: string): boolean {
  const base = code.split("-")[0].toLowerCase();
  return SELECTABLE_LANGUAGE_CODES.some((candidate) => candidate === code || candidate.split("-")[0].toLowerCase() === base);
}

export function normalizeDetectedCode(code: string): string {
  return code.split("-")[0].toLowerCase() === "zh" ? "zh-Hans" : canonicalTag(code);
}
