const UNCLOSED_MARKER_SIGNATURE = /\u27e6[a-zA-Z]\d{1,6}(?!\d)(?!\u27e7)/;
const MISSING_OPEN_MARKER_SIGNATURE = /(?<!\u27e6)[a-zA-Z]\d{1,6}\u27e7/;
const MARKER_BRACKET_PATTERN = /[\u27e6\u27e7]/g;
const ANY_MARKER_PATTERN = /\u27e6[^\u27e6\u27e7]*\u27e7/g;
const CORRUPT_INLINE_MARKER_PATTERN = /\u27e6[a-zA-Z0-9]+(?!\u27e7)|(?<!\u27e6)[a-zA-Z0-9]+\u27e7/g;

export const CORRUPT_MARKER_SIGNATURE = new RegExp(
  `${/\\+[^\u27e6\u27e7]{0,6}?\d{1,6}\u27e7/.source}|${UNCLOSED_MARKER_SIGNATURE.source}|${MISSING_OPEN_MARKER_SIGNATURE.source}`
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

export function repairCorruptMarkers(text: string, prefixChar: string, expectedIds: number[]): string {
  if (!text || expectedIds.length === 0) return text;

  const validPattern = new RegExp(`\\u27e6${prefixChar}(\\d+)\\u27e7`, "g");
  const seen = new Set<number>();
  for (const m of text.matchAll(validPattern)) seen.add(Number(m[1]));
  const pending = new Set(expectedIds.filter((id) => !seen.has(id)));
  if (pending.size === 0) return text;

  const pattern = /([^\d\s]*\s*)(\d+)(\s*[^\d\s]*)/g;
  let result = text.replace(pattern, (match, before: string, numStr: string, after: string) => {
    const cid = Number(numStr);
    if (pending.has(cid)) {
      const corruptChars = "\u27e6\u27e7\\\ufffd[]{}<> " + prefixChar.toLowerCase() + prefixChar.toUpperCase();
      let cleanBefore = before;
      while (cleanBefore.length > 0 && corruptChars.includes(cleanBefore[cleanBefore.length - 1]!)) {
        cleanBefore = cleanBefore.slice(0, -1);
      }
      let cleanAfter = after;
      while (cleanAfter.length > 0 && corruptChars.includes(cleanAfter[0]!)) {
        cleanAfter = cleanAfter.slice(1);
      }

      let isMarker = false;
      const beforeStr = before.trim().toLowerCase();
      if (beforeStr.endsWith(prefixChar.toLowerCase())) {
        isMarker = true;
      } else {
        const checkChars = "\u27e6\u27e7\\\ufffd[]{}<>";
        const combined = before + after;
        for (const ch of combined) {
          if (checkChars.includes(ch)) {
            isMarker = true;
            break;
          }
        }
      }

      if (isMarker) {
        pending.delete(cid);
        return `${cleanBefore}\u27e6${prefixChar}${cid}\u27e7${cleanAfter}`;
      }
    }
    return match;
  });

  if (pending.size > 0) {
    const emptyPattern = new RegExp(`(?:[\\u27e6\\\\\\ufffd]{1,3}${prefixChar}[\\u27e7\\\\\\ufffd]{1,3}|[\\u27e6\\u27e7\\\\\\ufffd]{2,4})`, "gi");
    const emptyMatches = Array.from(result.matchAll(emptyPattern));
    if (emptyMatches.length > 0 && emptyMatches.length <= pending.size) {
      const pendingList = Array.from(pending).sort((a, b) => a - b);
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
