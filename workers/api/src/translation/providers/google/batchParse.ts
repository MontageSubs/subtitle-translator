import { hasContent } from "../../engine/text";
import { GROUP_MARKER_PATTERN } from "../../engine/markedParse";
import { repairCorruptMarkers, sanitizeMarkersAgainstSource } from "../../engine/markerRepair";
import { cleanTranslatedFragment } from "./html";

const SPAN_NAME_PATTERN = /<span/gi;
const DIV_NAME_PATTERN = /<div/gi;
const SPAN_ID_PATTERN = /(?=\bid=["']?([a-zA-Z0-9:]+))/gi;
const SPAN_NAME_LENGTH = 5;
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

function* openingTags(html: string, namePattern: RegExp): Generator<{ start: number; end: number }> {
  namePattern.lastIndex = 0;
  for (let name = namePattern.exec(html); name; name = namePattern.exec(html)) {
    const close = html.indexOf(">", namePattern.lastIndex);
    if (close === -1) return;
    yield { start: name.index, end: close + 1 };
    namePattern.lastIndex = close + 1;
  }
}

function lastSpanId(html: string, tag: { start: number; end: number }): string | undefined {
  let id: string | undefined;
  const attributes = html.slice(tag.start + SPAN_NAME_LENGTH - 1, tag.end - 1);
  for (const match of attributes.matchAll(SPAN_ID_PATTERN)) id = match[1];
  return id;
}

function collectOpeners(html: string): Opener[] {
  const openers: Opener[] = [];
  for (const tag of openingTags(html, SPAN_NAME_PATTERN)) {
    const key = lastSpanId(html, tag);
    if (key !== undefined) openers.push({ ...tag, key });
  }
  for (const match of html.matchAll(GROUP_MARKER_PATTERN)) openers.push({ start: match.index!, end: match.index! + match[0].length, key: match[1]! });
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
  for (const { start } of openingTags(html, DIV_NAME_PATTERN)) stops.push(start);
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
