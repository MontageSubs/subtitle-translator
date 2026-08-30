const CORRUPT_MARKER_PATTERN = /\\+[^\u27e6\u27e7]{0,6}?(\d{1,6})\u27e7/g;
const UNCLOSED_MARKER_SIGNATURE = /\u27e6[a-zA-Z]\d{1,6}(?!\d)(?!\u27e7)/;
const MISSING_OPEN_MARKER_SIGNATURE = /(?<!\u27e6)[a-zA-Z]\d{1,6}\u27e7/;
const MARKER_BRACKET_PATTERN = /[\u27e6\u27e7]/g;

export const CORRUPT_MARKER_SIGNATURE = new RegExp(
  `${/\\+[^\u27e6\u27e7]{0,6}?\d{1,6}\u27e7/.source}|${UNCLOSED_MARKER_SIGNATURE.source}|${MISSING_OPEN_MARKER_SIGNATURE.source}`
);

function ownMarkerPattern(prefixChar: string): RegExp {
  return new RegExp(`\\u27e6${prefixChar}(\\d+)\\u27e7`, "gi");
}

function repairDisplacedCloseBracket(text: string, prefixChar: string, pending: Set<number>): string {
  if (pending.size === 0) return text;
  const pattern = new RegExp(`\\u27e6${prefixChar}(\\d+)\\s{0,2}\\u27e7`, "gi");
  return text.replace(pattern, (match, digits: string) => {
    const id = Number(digits);
    if (!pending.has(id)) return match;
    pending.delete(id);
    return `\u27e6${prefixChar}${id}\u27e7`;
  });
}

function repairUnclosedMarker(text: string, prefixChar: string, pending: Set<number>): string {
  if (pending.size === 0) return text;
  const pattern = new RegExp(`\\u27e6${prefixChar}(\\d+)(?!\\d)(?!\\u27e7)`, "gi");
  return text.replace(pattern, (match, digits: string) => {
    const id = Number(digits);
    if (!pending.has(id)) return match;
    pending.delete(id);
    return `${match}\u27e7`;
  });
}

function repairMissingOpenBracket(text: string, prefixChar: string, pending: Set<number>): string {
  if (pending.size === 0) return text;
  const pattern = new RegExp(`(?<!\\u27e6)${prefixChar}(\\d{1,6})\\u27e7`, "gi");
  return text.replace(pattern, (match, digits: string) => {
    const id = Number(digits);
    if (!pending.has(id)) return match;
    pending.delete(id);
    return `\u27e6${match}`;
  });
}

export function repairCorruptMarkers(text: string, prefixChar: string, expectedIds: number[]): string {
  if (!text || expectedIds.length === 0) return text;
  const seen = new Set<number>();
  for (const m of text.matchAll(ownMarkerPattern(prefixChar))) seen.add(Number(m[1]));
  const pending = new Set(expectedIds.filter((id) => !seen.has(id)));
  if (pending.size === 0) return text;

  let result = repairDisplacedCloseBracket(text, prefixChar, pending);
  if (pending.size === 0) return result;

  result = repairUnclosedMarker(result, prefixChar, pending);
  if (pending.size === 0) return result;

  result = repairMissingOpenBracket(result, prefixChar, pending);
  if (pending.size === 0) return result;

  let cursor = 0;
  let changed = false;
  const pieces: string[] = [];
  for (const m of result.matchAll(CORRUPT_MARKER_PATTERN)) {
    const digits = m[1]!;
    const candidates = Array.from(pending).filter((id) => String(id).endsWith(digits));
    if (candidates.length !== 1) continue;
    const [id] = candidates;
    pending.delete(id);
    pieces.push(result.slice(cursor, m.index));
    pieces.push(`\u27e6${prefixChar}${id}\u27e7`);
    cursor = m.index! + m[0].length;
    changed = true;
  }
  if (!changed) return result;
  pieces.push(result.slice(cursor));
  return pieces.join("");
}

export function hasMarkerLeak(originalText: string, translatedText: string): boolean {
  const originalCount = (originalText.match(MARKER_BRACKET_PATTERN) || []).length;
  const translatedCount = (translatedText.match(MARKER_BRACKET_PATTERN) || []).length;
  return translatedCount > originalCount;
}
