import { SELECTABLE_LANGUAGE_CODES } from "./languageProfiles";
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

export interface DetectionResult {
  code: string;
  reliable: boolean;
}

export async function detectSourceLanguage(cues: readonly DetectionCue[]): Promise<DetectionResult | null> {
  const sample = detectionSampleOf(cues);
  if (!sample) return null;
  const { eld } = await import("eld/small");
  const result = eld.detect(sample);
  return result.language ? { code: result.language, reliable: result.isReliable() } : null;
}

export function warmLanguageDetector(): void {
  void import("eld/small").catch(() => undefined);
}

export function isKnownSourceLanguage(code: string): boolean {
  const base = code.split("-")[0].toLowerCase();
  return SELECTABLE_LANGUAGE_CODES.some((candidate) => candidate === code || candidate.split("-")[0].toLowerCase() === base);
}

export function normalizeDetectedCode(code: string): string {
  return code.split("-")[0].toLowerCase() === "zh" ? "zh-Hans" : canonicalTag(code);
}
