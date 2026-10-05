import { SELECTABLE_LANGUAGE_CODES } from "./languageProfiles";

const SAMPLE_CUE_COUNT = 24;
const SAMPLE_MAX_CHARS = 2000;

export interface DetectionResult {
  code: string;
  reliable: boolean;
}

export async function detectSourceLanguage(cues: { text: string }[]): Promise<DetectionResult | null> {
  const sample = cues.slice(0, SAMPLE_CUE_COUNT).map((c) => c.text).join(" ").slice(0, SAMPLE_MAX_CHARS).trim();
  if (!sample) return null;
  const { eld } = await import("eld/small");
  const result = eld.detect(sample);
  return result.language ? { code: result.language, reliable: result.isReliable() } : null;
}

export function isKnownSourceLanguage(code: string): boolean {
  const base = code.split("-")[0].toLowerCase();
  return SELECTABLE_LANGUAGE_CODES.some((candidate) => candidate === code || candidate.split("-")[0].toLowerCase() === base);
}

export function normalizeDetectedCode(code: string): string {
  return code.split("-")[0].toLowerCase() === "zh" ? "zh-Hans" : code;
}
