import type { TermMatch } from "../../subtitle/types";
import { escapeRegExp } from "../../subtitle/regex";
import { hasContent } from "./text";

const WORD_CLASS = "[\\p{L}\\p{N}_]";
const WORD_BOUNDARY = `(?:(?<=${WORD_CLASS})(?!${WORD_CLASS})|(?<!${WORD_CLASS})(?=${WORD_CLASS}))`;
const WHITESPACE_BOUNDARY = "\\s*";
const PATTERN_CACHE_LIMIT = 256;
const patternCache = new Map<string, RegExp>();

const scansWholeWords = (literal: string, collapseWhitespace: boolean): boolean => !collapseWhitespace && literal !== "";

function termPattern(literal: string, collapseWhitespace: boolean): RegExp {
  const key = `${collapseWhitespace ? "w" : "b"}:${literal}`;
  let pattern = patternCache.get(key);
  if (!pattern) {
    if (patternCache.size >= PATTERN_CACHE_LIMIT) patternCache.clear();
    const boundary = collapseWhitespace ? WHITESPACE_BOUNDARY : WORD_BOUNDARY;
    patternCache.set(key, (pattern = new RegExp(boundary + escapeRegExp(literal) + boundary, scansWholeWords(literal, collapseWhitespace) ? "uy" : "gu")));
  }
  return pattern;
}

function replaceWholeWords(text: string, literal: string, replacement: string): string {
  const pattern = termPattern(literal, false);
  let result = "";
  let copied = 0;
  for (let at = text.indexOf(literal); at !== -1; ) {
    pattern.lastIndex = at;
    const matches = pattern.test(text);
    if (matches) {
      result += text.slice(copied, at) + replacement;
      copied = at + literal.length;
    }
    at = text.indexOf(literal, matches ? copied : at + 1);
  }
  return copied === 0 ? text : result + text.slice(copied);
}

export function applyTermReplacements(translated: string, original: string, matches: readonly TermMatch[], collapseWhitespace: boolean): string {
  if (!translated || !matches.length) return translated;
  const targets = new Map<string, string>();
  for (const match of matches) {
    const matched = original.slice(match.start, match.end);
    if (!targets.has(matched)) targets.set(matched, match.target);
  }
  let result = translated;
  for (const [matched, target] of [...targets].sort((a, b) => b[0].length - a[0].length)) {
    if (!result.includes(matched)) continue;
    result = scansWholeWords(matched, collapseWhitespace) ? replaceWholeWords(result, matched, target) : result.replace(termPattern(matched, collapseWhitespace), () => target);
  }
  return result;
}

export function hasTranslatableContent(text: string, matches: readonly TermMatch[]): boolean {
  let cursor = 0;
  let residue = "";
  for (const match of [...matches].sort((a, b) => a.start - b.start)) {
    residue += text.slice(cursor, match.start);
    cursor = match.end;
  }
  return hasContent(residue + text.slice(cursor));
}
