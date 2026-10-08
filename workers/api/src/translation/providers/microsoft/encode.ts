import type { TermMatch } from "../../../subtitle/types";
import { CUE_MARKER_PATTERN } from "../../../subtitle/markers";
import { escapeHtml } from "../../engine/text";
import { escapeFormattingTags } from "./formatting";

interface ProtectedRange {
  start: number;
  end: number;
  wrap: boolean;
  target?: string;
}

const escapeSegment = (text: string): string => escapeHtml(escapeFormattingTags(text));

function mergeRanges(ranges: ProtectedRange[]): ProtectedRange[] {
  const merged: ProtectedRange[] = [];
  for (const range of ranges.sort((a, b) => a.start - b.start)) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end && range.wrap === last.wrap) {
      last.end = Math.max(last.end, range.end);
      last.target ||= range.target;
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

export function encodeWithDictionary(text: string, matches: readonly TermMatch[]): string {
  const ranges: ProtectedRange[] = [];
  for (const marker of text.matchAll(CUE_MARKER_PATTERN)) ranges.push({ start: marker.index!, end: marker.index! + marker[0].length, wrap: false });
  for (const match of matches) ranges.push({ start: match.start, end: match.end, wrap: true, target: match.target });

  const pieces: string[] = [];
  let cursor = 0;
  for (const range of mergeRanges(ranges)) {
    if (range.start > cursor) pieces.push(escapeSegment(text.slice(cursor, range.start)));
    const piece = escapeSegment(text.slice(range.start, range.end));
    pieces.push(range.wrap ? `<mstrans:dictionary translation="${range.target ? escapeHtml(range.target) : piece}">${piece}</mstrans:dictionary>` : piece);
    cursor = range.end;
  }
  if (cursor < text.length) pieces.push(escapeSegment(text.slice(cursor)));
  return pieces.join("");
}
