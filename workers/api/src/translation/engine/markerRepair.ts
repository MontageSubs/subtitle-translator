import { compareMarkerIds, normalizeMarkerWhitespace } from "../../subtitle/markers";

const OPEN = "\u27e6";
const CLOSE = "\u27e7";
const UNCLOSED_MARKER = /\u27e6[a-zA-Z]\d{1,6}(?:\.\d{1,6})?(?![\d.])(?!\u27e7)/;
const MISSING_OPEN_MARKER = /(?<!\u27e6)[a-zA-Z]\d{1,6}(?:\.\d{1,6})?\u27e7/;
const ESCAPED_MARKER = /\\+[^\u27e6\u27e7]{0,6}?\d{1,6}(?:\.\d{1,6})?\u27e7/;
const BRACKET_PATTERN = /[\u27e6\u27e7]/g;
const ANY_MARKER_PATTERN = /\u27e6[^\u27e6\u27e7]*\u27e7/g;
const CORRUPT_INLINE_MARKER_PATTERN = /\u27e6[a-zA-Z0-9.]+(?!\u27e7)|(?<!\u27e6)[a-zA-Z0-9.]+\u27e7/g;
const MARKER_DEBRIS_PATTERN = /\\+[0-9\ufffd]{0,6}(?:[muc](?![a-zA-Z0-9])|(?=\u27e6))/g;
const CANDIDATE_PATTERN = /([^\d\s]*\s*)(\d+(?:\.\d+)?)(\s*[^\d\s]*)/g;
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

function countOccurrences(text: string, pattern: RegExp): Map<string, number> {
  const counts = new Map<string, number>();
  for (const match of text.matchAll(pattern)) counts.set(match[0], (counts.get(match[0]) ?? 0) + 1);
  return counts;
}

function keepAllowed(text: string, pattern: RegExp, allowed: Map<string, number>): string {
  return text.replace(pattern, (value) => {
    const remaining = allowed.get(value) ?? 0;
    if (remaining <= 0) return "";
    allowed.set(value, remaining - 1);
    return value;
  });
}

export function sanitizeMarkersAgainstSource(text: string, source: string): string {
  if (!text) return "";
  let cleaned = keepAllowed(text, ANY_MARKER_PATTERN, countOccurrences(source, ANY_MARKER_PATTERN));
  cleaned = keepAllowed(cleaned, CORRUPT_INLINE_MARKER_PATTERN, countOccurrences(source, CORRUPT_INLINE_MARKER_PATTERN));
  const sourceBrackets = countBrackets(source);
  if (countBrackets(cleaned) > sourceBrackets) {
    let kept = 0;
    cleaned = cleaned.replace(BRACKET_PATTERN, (bracket) => (kept++ < sourceBrackets ? bracket : ""));
  }
  return cleaned.trim().replace(/\s+/g, " ");
}

const validPatterns = new Map<string, RegExp>();
const emptyPatterns = new Map<string, RegExp>();

function validMarkerPattern(prefix: string): RegExp {
  let pattern = validPatterns.get(prefix);
  if (!pattern) validPatterns.set(prefix, (pattern = new RegExp(`\\u27e6${prefix}(\\d+(?:\\.\\d+)?)\\u27e7`, "gi")));
  return pattern;
}

function emptyMarkerPattern(prefix: string): RegExp {
  let pattern = emptyPatterns.get(prefix);
  if (!pattern) {
    pattern = new RegExp(`(?:[\\u27e6\\\\\\ufffd]{1,3}${prefix}[\\u27e7\\\\\\ufffd]{1,3}|[\\u27e6\\u27e7\\\\\\ufffd]{2,4})`, "gi");
    emptyPatterns.set(prefix, pattern);
  }
  return pattern;
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
  const prefixTrim = new RegExp(`[${prefixLower}${prefix.toUpperCase()}\\s]+$`);
  let result = text.replace(CANDIDATE_PATTERN, (match, before: string, id: string, after: string) => {
    if (!pending.has(id)) return match;
    const openAt = before.lastIndexOf(OPEN);
    const closeAt = after.indexOf(CLOSE);
    if (!(before.trim().toLowerCase().endsWith(prefixLower) || openAt !== -1 || closeAt !== -1)) return match;
    pending.delete(id);
    const head = openAt !== -1 ? before.slice(0, openAt) : before.replace(prefixTrim, "");
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
