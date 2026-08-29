const ANY_MARKER_PATTERN = /\u27e6[a-zA-Z](\d+)\u27e7/g;
const CORRUPT_MARKER_PATTERN = /\\+[^\u27e6\u27e7]{0,6}?(\d{1,6})\u27e7/g;

export const CORRUPT_MARKER_SIGNATURE = /\\+[^\u27e6\u27e7]{0,6}?\d{1,6}\u27e7/;

export function repairCorruptMarkers(text: string, prefixChar: string, expectedIds: number[]): string {
  if (!text || expectedIds.length === 0) return text;
  const seen = new Set<number>();
  for (const m of text.matchAll(ANY_MARKER_PATTERN)) seen.add(Number(m[1]));
  const pending = expectedIds.filter((id) => !seen.has(id));
  if (pending.length === 0) return text;

  let cursor = 0;
  let changed = false;
  const pieces: string[] = [];
  for (const m of text.matchAll(CORRUPT_MARKER_PATTERN)) {
    const digits = m[1]!;
    const candidates = pending.filter((id) => !seen.has(id) && String(id).endsWith(digits));
    if (candidates.length !== 1) continue;
    const [id] = candidates;
    seen.add(id);
    pieces.push(text.slice(cursor, m.index));
    pieces.push(`\u27e6${prefixChar}${id}\u27e7`);
    cursor = m.index! + m[0].length;
    changed = true;
  }
  if (!changed) return text;
  pieces.push(text.slice(cursor));
  return pieces.join("");
}
