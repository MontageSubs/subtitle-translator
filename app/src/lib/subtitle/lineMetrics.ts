import { languageProfile } from '../../utils/languageProfiles';
import { joinCueLines } from './styleTagFold';

const LATIN_WORD_PATTERN = /[a-zA-Z]+(?:['’][a-zA-Z]+)*/g;
const DIGIT_PATTERN = /\d/g;
const OTHER_WORD_PATTERN = /(?![a-zA-Z0-9])[\p{L}\p{N}]/gu;
const SUBTITLE_TAG_PATTERN = /\{[^}]*\}|<[^>]+>/g;

export function stripSubtitleTags(text: string): string {
  return text.replace(SUBTITLE_TAG_PATTERN, "");
}

function effectiveLength(text: string): number {
  const clean = stripSubtitleTags(text);
  const latinWords = (clean.match(LATIN_WORD_PATTERN) || []).length;
  const digits = (clean.match(DIGIT_PATTERN) || []).length;
  const others = (clean.match(OTHER_WORD_PATTERN) || []).length;
  return latinWords * 2.5 + digits * 0.5 + others || clean.length;
}

export interface LineMetrics {
  cps: number;
  longestLine: number;
  overCps: boolean;
  overLength: boolean;
}

export function evaluateLineMetrics(text: string, durationMs: number, targetLang?: string): LineMetrics {
  const profile = languageProfile(targetLang);
  const normalized = text.replace(/\\N/g, "\n");
  const lines = normalized
    .split("\n")
    .map((line) => stripSubtitleTags(line).replace(/[ \t]+/g, " ").trim())
    .filter(Boolean);
  const longestLine = lines.reduce((max, line) => Math.max(max, line.length), 0);
  const durationSeconds = Math.max(durationMs / 1000, 0.001);
  const cps = effectiveLength(joinCueLines(normalized)) / durationSeconds;
  return {
    cps,
    longestLine,
    overCps: cps > profile.readingSpeedCps,
    overLength: longestLine > profile.maxCharsPerLine,
  };
}
