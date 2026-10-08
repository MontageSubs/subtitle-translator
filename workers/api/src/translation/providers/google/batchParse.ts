import { hasContent } from "../../engine/text";
import { GROUP_MARKER_PATTERN } from "../../engine/markedParse";
import { repairCorruptMarkers, sanitizeMarkersAgainstSource } from "../../engine/markerRepair";
import { cleanTranslatedFragment } from "./html";

const SPAN_OPEN_PATTERN = /<span[^>]*\bid=["']?([a-zA-Z0-9:]+)["']?[^>]*>/gi;
const DIV_OPEN_PATTERN = /<div[^>]*>/gi;
const NUMERIC_PATTERN = /^\d+$/;

interface Anchor {
  start: number;
  end: number;
  index: number;
}

interface Opener {
  start: number;
  end: number;
  key: string;
}

function collectOpeners(html: string): Opener[] {
  const openers: Opener[] = [];
  for (const pattern of [SPAN_OPEN_PATTERN, GROUP_MARKER_PATTERN]) {
    for (const match of html.matchAll(pattern)) openers.push({ start: match.index!, end: match.index! + match[0].length, key: match[1]! });
  }
  return openers;
}

function findAnchors(openers: readonly Opener[], expected: ReadonlySet<number>): Anchor[] {
  const first = new Map<number, Anchor>();
  for (const { start, end, key } of openers) {
    if (!NUMERIC_PATTERN.test(key)) continue;
    const index = Number(key);
    const known = first.get(index);
    if (expected.has(index) && (!known || start < known.start)) first.set(index, { start, end, index });
  }
  return [...first.values()].sort((a, b) => a.start - b.start);
}

function collectStops(html: string, openers: readonly Opener[], anchors: readonly Anchor[]): number[] {
  const stops = anchors.map((anchor) => anchor.start);
  for (const { start, key } of openers) if (!NUMERIC_PATTERN.test(key)) stops.push(start);
  for (const match of html.matchAll(DIV_OPEN_PATTERN)) stops.push(match.index!);
  return stops.sort((a, b) => a - b);
}

export function parseBatchResponse(translatedHtml: string, sourceByIndex: ReadonlyMap<number, string>): Map<number, string> {
  const flat = repairCorruptMarkers(translatedHtml, "t", [...sourceByIndex.keys()]);
  const openers = collectOpeners(flat);
  const anchors = findAnchors(openers, new Set(sourceByIndex.keys()));
  const stops = collectStops(flat, openers, anchors);
  const parsed = new Map<number, string>();
  let cursor = 0;
  for (const { end, index } of anchors) {
    while (cursor < stops.length && stops[cursor]! <= end) cursor++;
    const boundary = cursor < stops.length ? stops[cursor]! : flat.length;
    const source = sourceByIndex.get(index) ?? "";
    const text = sanitizeMarkersAgainstSource(cleanTranslatedFragment(boundary < end ? "" : flat.slice(end, boundary)), source);
    if (text || (source && !hasContent(source))) parsed.set(index, text);
  }
  return parsed;
}
