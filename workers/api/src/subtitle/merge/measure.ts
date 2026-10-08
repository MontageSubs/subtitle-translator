import type { ReadingLimits } from "../languages/types";
import { isAsciiDigit, isAsciiLetter, isNonAsciiAlnum } from "../charClass";

export const LATIN_WORD_PATTERN = /[a-zA-Z]+(?:['’][a-zA-Z]+)*/g;

const PUNCT_WEIGHT_CHARS: ReadonlySet<number> = new Set([..."，,、；;。.!?！？：:…"].map((char) => char.codePointAt(0)!));
const LATIN_WORD_WEIGHT = 2.5;
const DIGIT_WEIGHT = 0.5;
const PUNCT_WEIGHT = 0.5;
const APOSTROPHES: ReadonlySet<number> = new Set([0x27, 0x2019]);

export const STYLE_TAG_PATTERN = /<\/?(?:i|b|u)>/gi;

function scanWeights(text: string, weights: Float64Array | null): number {
  let total = 0;
  let wordStart = -1;
  const closeWord = (end: number) => {
    if (wordStart < 0) return;
    total += LATIN_WORD_WEIGHT;
    if (weights) weights.fill(LATIN_WORD_WEIGHT / (end - wordStart), wordStart, end);
    wordStart = -1;
  };
  for (let i = 0; i < text.length; i++) {
    let code = text.charCodeAt(i);
    if (isAsciiLetter(code)) {
      if (wordStart < 0) wordStart = i;
      continue;
    }
    if (wordStart >= 0 && APOSTROPHES.has(code) && i + 1 < text.length && isAsciiLetter(text.charCodeAt(i + 1))) continue;
    closeWord(i);
    if (isAsciiDigit(code)) {
      total += DIGIT_WEIGHT;
      if (weights) weights[i] = DIGIT_WEIGHT;
      continue;
    }
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) code = text.codePointAt(i)!;
    if (code >= 128 && isNonAsciiAlnum(code)) {
      total += 1;
      if (weights) weights[i] = 1;
    } else if (PUNCT_WEIGHT_CHARS.has(code) && weights) {
      weights[i] = PUNCT_WEIGHT;
    }
    if (code > 0xffff) i++;
  }
  closeWord(text.length);
  return total;
}

export function effectiveLength(text: string): number {
  if (text.includes("<")) text = text.replace(STYLE_TAG_PATTERN, "");
  return scanWeights(text, null) || text.length;
}

export function buildWeightPrefix(text: string): Float64Array {
  const weights = new Float64Array(text.length);
  scanWeights(text, weights);
  const prefix = new Float64Array(text.length + 1);
  for (let i = 0; i < weights.length; i++) prefix[i + 1] = prefix[i]! + weights[i]!;
  return prefix;
}

export function roundHalfEven(value: number): number {
  const floor = Math.floor(value);
  const fraction = value - floor;
  if (fraction === 0.5) return floor % 2 === 0 ? floor : floor + 1;
  return fraction < 0.5 ? floor : floor + 1;
}

export function bisectLeft(sorted: ArrayLike<number>, target: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid]! < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function evaluateReadingSpeed(text: string, durationMs: number, limits: ReadingLimits) {
  let longestLine = 0;
  for (const line of text.split("\n")) if (line) longestLine = Math.max(longestLine, effectiveLength(line));
  const cps = effectiveLength(text.replace(/\n/g, " ")) / Math.max(durationMs / 1000, 0.001);
  return { cps, over_cps: cps > limits.cps, over_length: longestLine > limits.maxCharsPerLine };
}
