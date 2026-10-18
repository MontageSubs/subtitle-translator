import { isAsciiDigit, isAsciiLetter, isNonAsciiAlnum } from "./charClass";
import { STYLE_TAG_PATTERN } from "./markup";

const LATIN_WORD_WEIGHT = 2.5;
const DIGIT_WEIGHT = 0.5;
const PUNCT_WEIGHT = 0.5;
const PUNCT_WEIGHT_CHARS: ReadonlySet<number> = new Set([..."，,、；;。.!?！？：:…"].map((char) => char.codePointAt(0)!));
const APOSTROPHES: ReadonlySet<number> = new Set([0x27, 0x2019]);

export function scanWeights(text: string, weights: Float64Array | null): number {
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
    } else if (weights && PUNCT_WEIGHT_CHARS.has(code)) {
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
