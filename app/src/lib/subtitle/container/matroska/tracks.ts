import {
  BLOCK_COMPRESSION_HEADER_STRIPPING, DEFAULT_TIMECODE_SCALE, isCaptionsCodec, TEXT_SUBTITLE_CODECS,
} from "./trackCodecs";
import {
  CODEC_ID, CODEC_PRIVATE_ID, CONTENT_COMPRESSION_ALGORITHM_ID, CONTENT_COMPRESSION_ID, CONTENT_COMPRESSION_SETTINGS_ID,
  CONTENT_ENCODING_ID, CONTENT_ENCODING_SCOPE_ID, CONTENT_ENCODING_TYPE_ID, CONTENT_ENCODINGS_ID, FLAG_DEFAULT_ID, FLAG_FORCED_ID,
  FLAG_HEARING_IMPAIRED_ID, AUDIO_TRACK_TYPE, SEEK_ID, SEEK_POSITION_ID, SEEK_TARGET_ID, SUBTITLE_TRACK_TYPE, TIMECODE_SCALE_ID, TRACK_ENTRY_ID,
  TRACK_LANGUAGE_BCP47_ID, TRACK_LANGUAGE_ID, TRACK_NAME_ID, TRACK_NUMBER_ID, TRACK_TYPE_ID, TRACK_UID_ID,
} from "./elementIds";
import { bytesEqual, childElements, readUnsigned } from "./ebml";

export type BlockCompression = { algorithm: "zlib" } | { algorithm: "headerStripping"; prefix: Uint8Array };

export interface MatroskaTrack {
  number: number;
  uid: number | null;
  codecId: string;
  isText: boolean;
  codecPrivate: Uint8Array | null;
  language: string | null;
  languageTag: string | null;
  name: string | null;
  isDefault: boolean;
  isForced: boolean;
  isHearingImpaired: boolean;
  compression: BlockCompression | null;
}

export interface MatroskaAudioTrack {
  language: string | null;
  languageTag: string | null;
  isDefault: boolean;
}

export interface SeekTargets {
  tracks: number | null;
  info: number | null;
  cues: number | null;
  tags: number | null;
  seekHeads: number[];
}

export const emptySeekTargets = (): SeekTargets => ({ tracks: null, info: null, cues: null, tags: null, seekHeads: [] });

export function mergeSeekTargets(primary: SeekTargets, secondary: SeekTargets): SeekTargets {
  return {
    tracks: primary.tracks ?? secondary.tracks,
    info: primary.info ?? secondary.info,
    cues: primary.cues ?? secondary.cues,
    tags: primary.tags ?? secondary.tags,
    seekHeads: [...primary.seekHeads, ...secondary.seekHeads],
  };
}

const ENCODING_SCOPE_BLOCKS = 1;
const ENCODING_TYPE_COMPRESSION = 0;
const TRACKS_ID_BYTES = [0x16, 0x54, 0xae, 0x6b];
const INFO_ID_BYTES = [0x15, 0x49, 0xa9, 0x66];
const CUES_ID_BYTES = [0x1c, 0x53, 0xbb, 0x6b];
const TAGS_ID_BYTES = [0x12, 0x54, 0xc3, 0x67];
const SEEK_HEAD_ID_BYTES = [0x11, 0x4d, 0x9b, 0x74];

const utf8 = new TextDecoder("utf-8");

const textOf = (bytes: Uint8Array): string => utf8.decode(bytes).replace(/\0+$/, "");

function parseCompression(body: Uint8Array): BlockCompression | null {
  for (const encoding of childElements(body)) {
    if (encoding.id !== CONTENT_ENCODING_ID) continue;
    const fields = body.subarray(encoding.start, encoding.end);
    let scope = ENCODING_SCOPE_BLOCKS;
    let type = ENCODING_TYPE_COMPRESSION;
    let algorithm = 0;
    let settings: Uint8Array = new Uint8Array(0);
    for (const field of childElements(fields)) {
      const value = fields.subarray(field.start, field.end);
      if (field.id === CONTENT_ENCODING_SCOPE_ID) scope = readUnsigned(value);
      else if (field.id === CONTENT_ENCODING_TYPE_ID) type = readUnsigned(value);
      else if (field.id === CONTENT_COMPRESSION_ID) {
        for (const detail of childElements(value)) {
          const detailValue = value.subarray(detail.start, detail.end);
          if (detail.id === CONTENT_COMPRESSION_ALGORITHM_ID) algorithm = readUnsigned(detailValue);
          else if (detail.id === CONTENT_COMPRESSION_SETTINGS_ID) settings = detailValue.slice();
        }
      }
    }
    if (type !== ENCODING_TYPE_COMPRESSION || !(scope & ENCODING_SCOPE_BLOCKS)) continue;
    return algorithm === BLOCK_COMPRESSION_HEADER_STRIPPING ? { algorithm: "headerStripping", prefix: settings } : { algorithm: "zlib" };
  }
  return null;
}

function readTrackEntry(body: Uint8Array): { type: number; track: MatroskaTrack } {
  let type = 0;
  const track: MatroskaTrack = {
    number: 0, uid: null, codecId: "", isText: false, codecPrivate: null, language: null, languageTag: null, name: null,
    isDefault: true, isForced: false, isHearingImpaired: false, compression: null,
  };
  for (const field of childElements(body)) {
    const value = body.subarray(field.start, field.end);
    switch (field.id) {
      case TRACK_NUMBER_ID: track.number = readUnsigned(value); break;
      case TRACK_UID_ID: track.uid = readUnsigned(value); break;
      case TRACK_TYPE_ID: type = readUnsigned(value); break;
      case CODEC_ID: track.codecId = textOf(value); break;
      case CODEC_PRIVATE_ID: track.codecPrivate = value.slice(); break;
      case TRACK_LANGUAGE_ID: track.language = textOf(value) || null; break;
      case TRACK_LANGUAGE_BCP47_ID: track.languageTag = textOf(value) || null; break;
      case TRACK_NAME_ID: track.name = textOf(value).trim() || null; break;
      case FLAG_DEFAULT_ID: track.isDefault = readUnsigned(value) !== 0; break;
      case FLAG_FORCED_ID: track.isForced = readUnsigned(value) !== 0; break;
      case FLAG_HEARING_IMPAIRED_ID: track.isHearingImpaired = readUnsigned(value) !== 0; break;
      case CONTENT_ENCODINGS_ID: track.compression = parseCompression(value); break;
    }
  }
  return { type, track };
}

function* trackEntries(tracksBody: Uint8Array): Generator<{ type: number; track: MatroskaTrack }> {
  for (const entry of childElements(tracksBody)) {
    if (entry.id === TRACK_ENTRY_ID) yield readTrackEntry(tracksBody.subarray(entry.start, entry.end));
  }
}

export function parseSubtitleTracks(tracksBody: Uint8Array): MatroskaTrack[] {
  const tracks: MatroskaTrack[] = [];
  for (const { type, track } of trackEntries(tracksBody)) {
    if (type !== SUBTITLE_TRACK_TYPE || track.number === 0) continue;
    track.isText = TEXT_SUBTITLE_CODECS.has(track.codecId);
    if (isCaptionsCodec(track.codecId)) track.isHearingImpaired = true;
    tracks.push(track);
  }
  return tracks;
}

export function parseAudioTracks(tracksBody: Uint8Array): MatroskaAudioTrack[] {
  const tracks: MatroskaAudioTrack[] = [];
  for (const { type, track } of trackEntries(tracksBody)) {
    if (type === AUDIO_TRACK_TYPE) tracks.push({ language: track.language, languageTag: track.languageTag, isDefault: track.isDefault });
  }
  return tracks;
}

export function parseTimecodeScale(infoBody: Uint8Array): number {
  for (const field of childElements(infoBody)) {
    if (field.id === TIMECODE_SCALE_ID) return readUnsigned(infoBody.subarray(field.start, field.end)) || DEFAULT_TIMECODE_SCALE;
  }
  return DEFAULT_TIMECODE_SCALE;
}

export function parseSeekTargets(seekHeadBody: Uint8Array): SeekTargets {
  const targets = emptySeekTargets();
  for (const seek of childElements(seekHeadBody)) {
    if (seek.id !== SEEK_ID) continue;
    const entry = seekHeadBody.subarray(seek.start, seek.end);
    let target: Uint8Array = new Uint8Array(0);
    let position: number | null = null;
    for (const field of childElements(entry)) {
      const value = entry.subarray(field.start, field.end);
      if (field.id === SEEK_TARGET_ID) target = value;
      else if (field.id === SEEK_POSITION_ID) position = readUnsigned(value);
    }
    if (position === null) continue;
    if (bytesEqual(target, TRACKS_ID_BYTES)) targets.tracks = position;
    else if (bytesEqual(target, INFO_ID_BYTES)) targets.info = position;
    else if (bytesEqual(target, CUES_ID_BYTES)) targets.cues = position;
    else if (bytesEqual(target, TAGS_ID_BYTES)) targets.tags = position;
    else if (bytesEqual(target, SEEK_HEAD_ID_BYTES)) targets.seekHeads.push(position);
  }
  return targets;
}
