import { languageProfile } from '../../utils/languageProfiles';
import { joinCueLines } from './styleTagFold';

const LATIN_WORD_PATTERN = /[a-zA-Z]+(?:['’][a-zA-Z]+)*/g;
const DIGIT_PATTERN = /\d/g;
const OTHER_WORD_PATTERN = /(?![a-zA-Z0-9])[\p{L}\p{N}]/gu;
const STYLE_TAG_PATTERN = /<\/?(?:i|b|u)>/gi;

function effectiveLength(text: string): number {
  text = text.replace(STYLE_TAG_PATTERN, "");
  const latinWords = (text.match(LATIN_WORD_PATTERN) || []).length;
  const digits = (text.match(DIGIT_PATTERN) || []).length;
  const others = (text.match(OTHER_WORD_PATTERN) || []).length;
  return latinWords * 2.5 + digits * 0.5 + others || text.length;
}

export interface LineMetrics {
  cps: number;
  longestLine: number;
  overCps: boolean;
  overLength: boolean;
}

export function evaluateLineMetrics(text: string, durationMs: number, targetLang?: string): LineMetrics {
  const profile = languageProfile(targetLang);
  const lines = text.split("\n").filter(Boolean);
  const longestLine = lines.reduce((max, line) => Math.max(max, effectiveLength(line)), 0);
  const durationSeconds = Math.max(durationMs / 1000, 0.001);
  const cps = effectiveLength(joinCueLines(text)) / durationSeconds;
  return {
    cps,
    longestLine,
    overCps: cps > profile.readingSpeedCps,
    overLength: longestLine > profile.maxCharsPerLine,
  };
}
