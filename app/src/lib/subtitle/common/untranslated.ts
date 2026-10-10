import { MUSIC_NOTE_CHARS } from "./charClass";
import { scriptOf } from "./languageCodes";
import { stripStyling } from "./markup";

const NOISE_PATTERN = new RegExp(`[\\s\\p{P}\\p{N}${MUSIC_NOTE_CHARS}]`, "gu");
const WORD_PATTERN = /[\p{L}\p{N}_]+/gu;
const MIN_WORDS_WITHIN_SCRIPT = 2;

export const normalizeForEquality = (text: string | null | undefined): string => stripStyling(text ?? "").replace(NOISE_PATTERN, "");

export const wordCount = (text: string): number => stripStyling(text).match(WORD_PATTERN)?.length ?? 0;

export const hasTranslatableContent = (text: string | null | undefined): boolean => normalizeForEquality(text).length > 0;

export function isLeakedUntranslated(original: string, translated: string, sourceLang: string | null | undefined, targetLang: string | null | undefined): boolean {
  if (!translated || !hasTranslatableContent(original)) return false;
  const sourceScript = scriptOf(sourceLang);
  const targetScript = scriptOf(targetLang);
  const crossesCjkBoundary = (sourceScript === "latin" && targetScript === "cjk") || (sourceScript === "cjk" && targetScript === "latin");
  if (!crossesCjkBoundary && wordCount(original) < MIN_WORDS_WITHIN_SCRIPT) return false;
  return normalizeForEquality(original) === normalizeForEquality(translated);
}
