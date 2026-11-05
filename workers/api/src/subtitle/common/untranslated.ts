import { MUSIC_NOTE_CHARS } from "./charClass";
import { scriptOf } from "./languageCodes";
import { stripStyling } from "./markup";

const NOISE_CHAR_PATTERN = new RegExp(`[\\s\\p{P}\\p{N}${MUSIC_NOTE_CHARS}]`, "u");
const TOKEN_PATTERN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]|[\p{L}\p{N}_]+/gu;
const PROPER_NAME_PATTERN = /^\p{Lu}[\p{L}'’.-]*(?:\s+\p{Lu}[\p{L}'’.-]*)*$/u;
const MIN_UNTRANSLATED_TOKENS = 2;
const noiseMemo = new Map<number, boolean>();

function isNoise(code: number): boolean {
  let known = noiseMemo.get(code);
  if (known === undefined) noiseMemo.set(code, (known = NOISE_CHAR_PATTERN.test(String.fromCodePoint(code))));
  return known;
}

function skipNoise(text: string, from: number): number {
  let index = from;
  while (index < text.length) {
    const code = text.codePointAt(index)!;
    if (!isNoise(code)) break;
    index += code > 0xffff ? 2 : 1;
  }
  return index;
}

function equalsIgnoringNoise(a: string, b: string): boolean {
  let i = 0;
  let j = 0;
  for (;;) {
    i = skipNoise(a, i);
    j = skipNoise(b, j);
    if (i === a.length || j === b.length) return i === a.length && j === b.length;
    const code = a.codePointAt(i)!;
    if (code !== b.codePointAt(j)) return false;
    const width = code > 0xffff ? 2 : 1;
    i += width;
    j += width;
  }
}

export function hasTranslatableContent(text: string | null | undefined): boolean {
  const styled = stripStyling(text ?? "");
  return skipNoise(styled, 0) < styled.length;
}

export function isLeakedUntranslated(original: string, translated: string, sourceLang: string | null | undefined, targetLang: string | null | undefined): boolean {
  if (!translated) return false;
  const styledOriginal = stripStyling(original);
  const styledTranslated = stripStyling(translated);
  if (!equalsIgnoringNoise(styledOriginal, styledTranslated)) return false;
  if ((styledOriginal.match(TOKEN_PATTERN)?.length ?? 0) < MIN_UNTRANSLATED_TOKENS) return false;
  const sourceScript = scriptOf(sourceLang);
  return !(sourceScript !== undefined && sourceScript === scriptOf(targetLang) && sourceScript !== "cjk" && PROPER_NAME_PATTERN.test(styledOriginal.replace(/[\s\p{P}\p{N}]+$/u, "").trim()));
}
