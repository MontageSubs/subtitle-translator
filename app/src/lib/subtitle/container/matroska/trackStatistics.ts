import { childElements, readUnsigned } from "./ebml";
import { SIMPLE_TAG_ID, TAG_ID, TAG_NAME_ID, TAG_STRING_ID, TAG_TARGETS_ID, TAG_TRACK_UID_ID } from "./elementIds";

const FRAME_COUNT_TAG_PREFIX = "NUMBER_OF_FRAMES";
const utf8 = new TextDecoder("utf-8");

const textOf = (bytes: Uint8Array): string => utf8.decode(bytes).replace(/\0+$/, "").trim();

function frameCountOf(tagBody: Uint8Array): number | null {
  for (const field of childElements(tagBody)) {
    if (field.id !== SIMPLE_TAG_ID) continue;
    const simple = tagBody.subarray(field.start, field.end);
    let name = "";
    let value = "";
    for (const part of childElements(simple)) {
      const bytes = simple.subarray(part.start, part.end);
      if (part.id === TAG_NAME_ID) name = textOf(bytes);
      else if (part.id === TAG_STRING_ID) value = textOf(bytes);
    }
    if (name.toUpperCase().startsWith(FRAME_COUNT_TAG_PREFIX) && /^\d+$/.test(value)) return Number(value);
  }
  return null;
}

function trackUidsOf(tagBody: Uint8Array): number[] {
  const uids: number[] = [];
  for (const field of childElements(tagBody)) {
    if (field.id !== TAG_TARGETS_ID) continue;
    const targets = tagBody.subarray(field.start, field.end);
    for (const target of childElements(targets)) if (target.id === TAG_TRACK_UID_ID) uids.push(readUnsigned(targets.subarray(target.start, target.end)));
  }
  return uids;
}

export function parseFrameCountsByTrackUid(tagsBody: Uint8Array): Map<number, number> {
  const counts = new Map<number, number>();
  for (const tag of childElements(tagsBody)) {
    if (tag.id !== TAG_ID) continue;
    const body = tagsBody.subarray(tag.start, tag.end);
    const frames = frameCountOf(body);
    if (frames === null) continue;
    for (const uid of trackUidsOf(body)) counts.set(uid, frames);
  }
  return counts;
}
