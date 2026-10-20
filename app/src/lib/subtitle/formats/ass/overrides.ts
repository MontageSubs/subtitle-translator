import type { AssTag, Cue } from '../../types';
import { assStyledText } from '../inlineStyle';

const AN_TAG_PATTERN = /\\an[1-9]/g;
const KARAOKE_TAG_PATTERN = /\\k[fo]?\d+/g;
const POSITIONING_TAG_PATTERN = /\\(?:pos|move|org)\(/;
const ASS_LINE_BREAK = "\\N";

export const stripAnTags = (tags: string): string => tags.replace(AN_TAG_PATTERN, "");

export function lineLevelTags(original: Cue | undefined): string {
  const tags = (original?.assTags ?? []).filter(([offset]) => offset === 0).map(([, tag]) => tag.replace(KARAOKE_TAG_PATTERN, "")).join("");
  return tags ? `{${tags}}` : "";
}

export const hasPositioningTags = (original: Cue | undefined): boolean => (original?.assTags ?? []).some(([, tag]) => POSITIONING_TAG_PATTERN.test(tag));

export function renderTaggedText(text: string, original: Cue | undefined, includeLeading = true): string {
  const tags = original?.text === text ? original.assTags?.filter(([offset]) => includeLeading || offset > 0) : undefined;
  if (!tags?.length) return assStyledText(text).replace(/\n/g, ASS_LINE_BREAK);
  let cursor = 0;
  let markup = "";
  for (const [offset, tag] of tags) {
    markup += `${text.slice(cursor, offset)}{${tag}}`;
    cursor = offset;
  }
  return `${markup}${text.slice(cursor)}`.replace(/\n/g, ASS_LINE_BREAK);
}

export function packAssTags(tags: AssTag[]): AssTag[] | undefined {
  const merged: AssTag[] = [];
  for (const [offset, tag] of tags) {
    const cleaned = stripAnTags(tag);
    if (!cleaned) continue;
    const last = merged[merged.length - 1];
    if (last?.[0] === offset) last[1] += cleaned;
    else merged.push([offset, cleaned]);
  }
  return merged.length ? merged : undefined;
}
