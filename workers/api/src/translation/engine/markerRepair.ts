import { compareMarkerIds, normalizeMarkerWhitespace } from "../../subtitle/markers";
import { getOrInsert } from "../../support/getOrInsert";

const OPEN = "\u27e6";
const CLOSE = "\u27e7";
const UNCLOSED_MARKER = /\u27e6[a-zA-Z]\d{1,6}(?:\.\d{1,6})?(?![\d.])(?!\u27e7)/;
const MISSING_OPEN_MARKER = /(?<!\u27e6)[a-zA-Z]\d{1,6}(?:\.\d{1,6})?\u27e7/;
const ESCAPED_MARKER = /(?<!\\)\\+[^\u27e6\u27e7]{0,6}?\d{1,6}(?:\.\d{1,6})?\u27e7/;
const BRACKET_PATTERN = /[\u27e6\u27e7]/g;
const ANY_MARKER_PATTERN = /\u27e6[^\u27e6\u27e7]*\u27e7/g;
const MARKER_DEBRIS_PATTERN = /(?<!\\)\\+[0-9\ufffd]{0,6}(?:[muc](?![a-zA-Z0-9])|(?=\u27e6))/g;
const NUMBER_PATTERN = /\d+(?:\.\d+)?/g;
const TRAILING_PUNCTUATION = ":,，：、-—.。 ";

const CORRUPT_MARKER_SIGNATURE = new RegExp(`${ESCAPED_MARKER.source}|${UNCLOSED_MARKER.source}|${MISSING_OPEN_MARKER.source}`);

export const hasCorruptMarker = (text: string): boolean => (text.includes(OPEN) || text.includes(CLOSE)) && CORRUPT_MARKER_SIGNATURE.test(text);

function countBrackets(text: string): number {
  let count = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code === 0x27e6 || code === 0x27e7) count++;
  }
  return count;
}

type SpanFinder = (text: string) => Iterable<readonly [number, number]>;

const spansOf = (pattern: RegExp): SpanFinder =>
  function* (text) {
    for (const match of text.matchAll(pattern)) yield [match.index!, match.index! + match[0].length];
  };

const isInlineMarkerChar = (code: number): boolean =>
  (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || code === 46;

function* corruptInlineMarkerSpans(text: string): Generator<readonly [number, number]> {
  const OPEN_CODE = 0x27e6;
  const CLOSE_CODE = 0x27e7;
  let at = 0;
  while (at < text.length) {
    const code = text.charCodeAt(at);
    if (code === OPEN_CODE) {
      let end = at + 1;
      while (isInlineMarkerChar(text.charCodeAt(end))) end++;
      const length = end - at - 1;
      const closed = text.charCodeAt(end) === CLOSE_CODE;
      if (length >= 1 && (!closed || length >= 2)) {
        const matchEnd = closed ? end - 1 : end;
        yield [at, matchEnd];
        at = matchEnd;
        continue;
      }
      at++;
    } else if (isInlineMarkerChar(code) && text.charCodeAt(at - 1) !== OPEN_CODE) {
      let end = at + 1;
      while (isInlineMarkerChar(text.charCodeAt(end))) end++;
      if (text.charCodeAt(end) === CLOSE_CODE) {
        yield [at, end + 1];
        at = end + 1;
      } else {
        at = end;
      }
    } else {
      at++;
    }
  }
}

function countOccurrences(text: string, find: SpanFinder): Map<string, number> {
  const counts = new Map<string, number>();
  for (const [start, end] of find(text)) {
    const value = text.slice(start, end);
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

const ANY_MARKER_SPANS = spansOf(ANY_MARKER_PATTERN);

const NO_MARKERS: Map<string, number> = new Map();

const hasBrackets = (text: string): boolean => text.includes(OPEN) || text.includes(CLOSE);

function keepAllowed(text: string, find: SpanFinder, allowed: Map<string, number>): string {
  let result = "";
  let copied = 0;
  for (const [start, end] of find(text)) {
    const value = text.slice(start, end);
    const remaining = allowed.get(value) ?? 0;
    if (remaining > 0) {
      allowed.set(value, remaining - 1);
      continue;
    }
    result += text.slice(copied, start);
    copied = end;
  }
  return copied === 0 ? text : result + text.slice(copied);
}

export function sanitizeMarkersAgainstSource(text: string, source: string): string {
  if (!text) return "";
  if (!hasBrackets(text)) return text.trim().replace(/\s+/g, " ");
  const sourceMarked = hasBrackets(source);
  const allowedIn = (find: SpanFinder) => (sourceMarked ? countOccurrences(source, find) : NO_MARKERS);
  let cleaned = keepAllowed(text, ANY_MARKER_SPANS, allowedIn(ANY_MARKER_SPANS));
  cleaned = keepAllowed(cleaned, corruptInlineMarkerSpans, allowedIn(corruptInlineMarkerSpans));
  const sourceBrackets = sourceMarked ? countBrackets(source) : 0;
  if (countBrackets(cleaned) > sourceBrackets) {
    let kept = 0;
    cleaned = cleaned.replace(BRACKET_PATTERN, (bracket) => (kept++ < sourceBrackets ? bracket : ""));
  }
  return cleaned.trim().replace(/\s+/g, " ");
}

const validPatterns = new Map<string, RegExp>();
const emptyPatterns = new Map<string, RegExp>();

function validMarkerPattern(prefix: string): RegExp {
  return getOrInsert(validPatterns, prefix, () => new RegExp(`\\u27e6${prefix}(\\d+(?:\\.\\d+)?)\\u27e7`, "gi"));
}

function emptyMarkerPattern(prefix: string): RegExp {
  return getOrInsert(emptyPatterns, prefix, () => new RegExp(`(?:[\\u27e6\\\\\\ufffd]{1,3}${prefix}[\\u27e7\\\\\\ufffd]{1,3}|[\\u27e6\\u27e7\\\\\\ufffd]{2,4})`, "gi"));
}

const isWhitespaceCode = (code: number): boolean =>
  (code >= 9 && code <= 13) || code === 32 || code === 0xa0 || code === 0x1680 || (code >= 0x2000 && code <= 0x200a) ||
  code === 0x2028 || code === 0x2029 || code === 0x202f || code === 0x205f || code === 0x3000 || code === 0xfeff;

const isPlainCode = (code: number): boolean => !(code >= 48 && code <= 57) && !isWhitespaceCode(code);

function trimmedLength(text: string, chars: string): number {
  let end = text.length;
  while (end > 0 && (chars.includes(text[end - 1]!) || isWhitespaceCode(text.charCodeAt(end - 1)))) end--;
  return end;
}

function replaceNumberContexts(text: string, replace: (match: string, before: string, id: string, after: string) => string): string {
  let result = "";
  let copied = 0;
  NUMBER_PATTERN.lastIndex = 0;
  for (let number = NUMBER_PATTERN.exec(text); number; number = NUMBER_PATTERN.exec(text)) {
    const numberEnd = number.index + number[0].length;
    let start = number.index;
    while (start > copied && isWhitespaceCode(text.charCodeAt(start - 1))) start--;
    while (start > copied && isPlainCode(text.charCodeAt(start - 1))) start--;
    let end = numberEnd;
    while (end < text.length && isWhitespaceCode(text.charCodeAt(end))) end++;
    while (end < text.length && isPlainCode(text.charCodeAt(end))) end++;
    result += text.slice(copied, start) + replace(text.slice(start, end), text.slice(start, number.index), number[0], text.slice(numberEnd, end));
    copied = end;
    NUMBER_PATTERN.lastIndex = end;
  }
  return result + text.slice(copied);
}

export function repairCorruptMarkers(text: string, prefix: string, expectedIds: readonly (string | number)[]): string {
  if (!text) return text;
  text = normalizeMarkerWhitespace(text);
  if (!expectedIds.length) return text;

  const seen = new Set<string>();
  for (const match of text.matchAll(validMarkerPattern(prefix))) seen.add(match[1]!);
  const pending = new Set(expectedIds.map(String).filter((id) => !seen.has(id)));
  if (!pending.size) return text;

  const prefixLower = prefix.toLowerCase();
  const prefixChars = prefixLower + prefix.toUpperCase();
  let result = replaceNumberContexts(text, (match, before, id, after) => {
    if (!pending.has(id)) return match;
    const openAt = before.lastIndexOf(OPEN);
    const closeAt = after.indexOf(CLOSE);
    if (!(before.trim().toLowerCase().endsWith(prefixLower) || openAt !== -1 || closeAt !== -1)) return match;
    pending.delete(id);
    const head = openAt !== -1 ? before.slice(0, openAt) : before.slice(0, trimmedLength(before, prefixChars));
    let tail = closeAt !== -1 ? after.slice(closeAt + 1) : after.replace(/^\s+/, "");
    let skip = 0;
    while (skip < tail.length && TRAILING_PUNCTUATION.includes(tail[skip]!)) skip++;
    return `${head}${OPEN}${prefix}${id}${CLOSE}${tail.slice(skip)}`;
  });

  if (pending.size) {
    const emptyPattern = emptyMarkerPattern(prefix);
    const emptyCount = result.match(emptyPattern)?.length ?? 0;
    if (emptyCount > 0 && emptyCount <= pending.size) {
      const queue = [...pending].sort(compareMarkerIds);
      result = result.replace(emptyPattern, (match) => (queue.length ? `${OPEN}${prefix}${queue.shift()}${CLOSE}` : match));
    }
  }
  return result;
}

export const hasMarkerLeak = (original: string, translated: string): boolean => countBrackets(translated) > countBrackets(original);

export const stripMarkerDebris = (text: string): string => text.replace(MARKER_DEBRIS_PATTERN, "");
