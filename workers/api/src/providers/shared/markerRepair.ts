const CORRUPT_MARKER_PATTERN = /\\+[^\u27e6\u27e7]{0,6}?(\d{1,6})\u27e7/g;
const UNCLOSED_MARKER_SIGNATURE = /\u27e6[a-zA-Z]\d{1,6}(?!\d)(?!\u27e7)/;
const MISSING_OPEN_MARKER_SIGNATURE = /(?<!\u27e6)[a-zA-Z]\d{1,6}\u27e7/;
const MARKER_BRACKET_PATTERN = /[\u27e6\u27e7]/g;

export const CORRUPT_MARKER_SIGNATURE = new RegExp(
  `${/\\+[^\u27e6\u27e7]{0,6}?\d{1,6}\u27e7/.source}|${UNCLOSED_MARKER_SIGNATURE.source}|${MISSING_OPEN_MARKER_SIGNATURE.source}`
);

export function repairCorruptMarkers(text: string, prefixChar: string, expectedIds: number[]): string {
  if (!text || expectedIds.length === 0) return text;

  const validPattern = new RegExp(`\\u27e6${prefixChar}(\\d+)\\u27e7`, "g");
  const seen = new Set<number>();
  for (const m of text.matchAll(validPattern)) seen.add(Number(m[1]));
  const expectedIdSet = new Set(expectedIds);
  const pending = new Set(expectedIds.filter((id) => !seen.has(id)));
  if (pending.size === 0) return text;

  const pattern = /([^\d\s]*\s*)(\d+)(\s*[^\d\s]*)/g;
  let result = text.replace(pattern, (match, before: string, numStr: string, after: string) => {
    const cid = Number(numStr);
    const beforeStr = before.trim().toLowerCase();
    let isMarker = beforeStr.endsWith(prefixChar.toLowerCase());
    if (!isMarker) {
      const checkChars = "\u27e6\u27e7\\\ufffd[]{}<>";
      const combined = before + after;
      for (const ch of combined) {
        if (checkChars.includes(ch)) {
          isMarker = true;
          break;
        }
      }
    }
    if (!isMarker) return match;

    const resolvedId = pending.has(cid) ? cid
      : (!expectedIdSet.has(cid) && pending.size > 0 ? Math.min(...pending) : undefined);
    if (resolvedId === undefined) return match;

    const corruptChars = "\u27e6\u27e7\\\ufffd[]{}<> " + prefixChar.toLowerCase() + prefixChar.toUpperCase();
    let cleanBefore = before;
    while (cleanBefore.length > 0 && corruptChars.includes(cleanBefore[cleanBefore.length - 1])) {
      cleanBefore = cleanBefore.slice(0, -1);
    }
    let cleanAfter = after;
    while (cleanAfter.length > 0 && corruptChars.includes(cleanAfter[0])) {
      cleanAfter = cleanAfter.slice(1);
    }

    pending.delete(resolvedId);
    return `${cleanBefore}\u27e6${prefixChar}${resolvedId}\u27e7${cleanAfter}`;
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
