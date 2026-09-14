import { compareMarkerIds, normalizeMarkerWhitespace } from "../../core/cueMarker";

const UNCLOSED_MARKER_SIGNATURE = /\u27e6[a-zA-Z]\d{1,6}(?:\.\d{1,6})?(?![\d.])(?!\u27e7)/;
const MISSING_OPEN_MARKER_SIGNATURE = /(?<!\u27e6)[a-zA-Z]\d{1,6}(?:\.\d{1,6})?\u27e7/;
const MARKER_BRACKET_PATTERN = /[\u27e6\u27e7]/g;
const ANY_MARKER_PATTERN = /\u27e6[^\u27e6\u27e7]*\u27e7/g;
const CORRUPT_INLINE_MARKER_PATTERN = /\u27e6[a-zA-Z0-9.]+(?!\u27e7)|(?<!\u27e6)[a-zA-Z0-9.]+\u27e7/g;

export const CORRUPT_MARKER_SIGNATURE = new RegExp(
  `${/\\+[^\u27e6\u27e7]{0,6}?\d{1,6}(?:\.\d{1,6})?\u27e7/.source}|${UNCLOSED_MARKER_SIGNATURE.source}|${MISSING_OPEN_MARKER_SIGNATURE.source}`
);

export function sanitizeMarkersAgainstSource(text: string, sourceText: string = ""): string {
  if (!text) return "";
  const source = sourceText || "";
  const allowed = new Map<string, number>();

  for (const m of source.matchAll(ANY_MARKER_PATTERN)) {
    const val = m[0];
    allowed.set(val, (allowed.get(val) || 0) + 1);
  }

  let cleaned = text.replace(ANY_MARKER_PATTERN, (val) => {
    const count = allowed.get(val) || 0;
    if (count > 0) {
      allowed.set(val, count - 1);
      return val;
    }
    return "";
  });

  for (const m of source.matchAll(CORRUPT_INLINE_MARKER_PATTERN)) {
    const val = m[0];
    allowed.set(val, (allowed.get(val) || 0) + 1);
  }

  cleaned = cleaned.replace(CORRUPT_INLINE_MARKER_PATTERN, (val) => {
    const count = allowed.get(val) || 0;
    if (count > 0) {
      allowed.set(val, count - 1);
      return val;
    }
    return "";
  });

  const origBracketCount = (source.match(MARKER_BRACKET_PATTERN) || []).length;
  const currBrackets = cleaned.match(MARKER_BRACKET_PATTERN) || [];
  if (currBrackets.length > origBracketCount) {
    let kept = 0;
    cleaned = cleaned.replace(MARKER_BRACKET_PATTERN, (match) => {
      if (kept < origBracketCount) {
        kept += 1;
        return match;
      }
      return "";
    });
  }

  return cleaned.trim().replace(/\s+/g, " ");
}

const validPatternCache = new Map<string, RegExp>();
function validMarkerPattern(prefixChar: string): RegExp {
  let pattern = validPatternCache.get(prefixChar);
  if (!pattern) {
    pattern = new RegExp(`\\u27e6${prefixChar}(\\d+(?:\\.\\d+)?)\\u27e7`, "gi");
    validPatternCache.set(prefixChar, pattern);
  }
  pattern.lastIndex = 0;
  return pattern;
}

const emptyPatternCache = new Map<string, RegExp>();
function emptyMarkerPattern(prefixChar: string): RegExp {
  let pattern = emptyPatternCache.get(prefixChar);
  if (!pattern) {
    pattern = new RegExp(`(?:[\\u27e6\\\\\\ufffd]{1,3}${prefixChar}[\\u27e7\\\\\\ufffd]{1,3}|[\\u27e6\\u27e7\\\\\\ufffd]{2,4})`, "gi");
    emptyPatternCache.set(prefixChar, pattern);
  }
  pattern.lastIndex = 0;
  return pattern;
}

export function repairCorruptMarkers(
  text: string,
  prefixChar: string,
  expectedIds: (string | number)[]
): string {
  if (!text) return text;
  text = normalizeMarkerWhitespace(text);
  if (expectedIds.length === 0) return text;
  const ids = expectedIds.map(String);

  const validPattern = validMarkerPattern(prefixChar);
  const seen = new Set<string>();
  for (const m of text.matchAll(validPattern)) seen.add(m[1]);
  const pending = new Set(ids.filter((id) => !seen.has(id)));
  if (pending.size === 0) return text;

  const DELIMITER_OPEN = "\u27e6";
  const DELIMITER_CLOSE = "\u27e7";
  const prefixChars = prefixChar.toLowerCase() + prefixChar.toUpperCase();
  const trailingPunctuation = ":,，：、-—.。 ";
  const prefixTrimPattern = new RegExp(`[${prefixChars}\\s]+$`);

  const pattern = /([^\d\s]*\s*)(\d+(?:\.\d+)?)(\s*[^\d\s]*)/g;
  let result = text.replace(pattern, (match, before: string, numStr: string, after: string) => {
    const cid = numStr;
    if (!pending.has(cid)) return match;

    const beforeStr = before.trim().toLowerCase();
    const openAt = before.lastIndexOf(DELIMITER_OPEN);
    const closeAt = after.indexOf(DELIMITER_CLOSE);
    const isMarker = beforeStr.endsWith(prefixChar.toLowerCase()) || openAt !== -1 || closeAt !== -1;
    if (!isMarker) return match;

    pending.delete(cid);
    let cleanBefore = openAt !== -1 ? before.slice(0, openAt) : before.replace(prefixTrimPattern, "");
    let cleanAfter = closeAt !== -1 ? after.slice(closeAt + 1) : after.replace(/^\s+/, "");
    while (cleanAfter.length > 0 && trailingPunctuation.includes(cleanAfter[0]!)) {
      cleanAfter = cleanAfter.slice(1);
    }
    return `${cleanBefore}${DELIMITER_OPEN}${prefixChar}${cid}${DELIMITER_CLOSE}${cleanAfter}`;
  });

  if (pending.size > 0) {
    const emptyPattern = emptyMarkerPattern(prefixChar);
    const emptyMatches = Array.from(result.matchAll(emptyPattern));
    if (emptyMatches.length > 0 && emptyMatches.length <= pending.size) {
      const pendingList = Array.from(pending).sort(compareMarkerIds);
      result = result.replace(emptyPattern, (match) => {
        if (pendingList.length > 0) {
          return `\u27e6${prefixChar}${pendingList.shift()}\u27e7`;
        }
        return match;
      });
    }
  }

  return result;
}

export function hasMarkerLeak(originalText: string, translatedText: string): boolean {
  const originalCount = (originalText.match(MARKER_BRACKET_PATTERN) || []).length;
  const translatedCount = (translatedText.match(MARKER_BRACKET_PATTERN) || []).length;
  return translatedCount > originalCount;
}

const MARKER_DEBRIS_PATTERN = /\\+[0-9\ufffd]{0,6}(?:[muc](?![a-zA-Z0-9])|(?=\u27e6))/g;

export function stripMarkerDebris(text: string): string {
  return text.replace(MARKER_DEBRIS_PATTERN, "");
}
