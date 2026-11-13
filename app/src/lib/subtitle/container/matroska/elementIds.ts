export const EBML_HEADER_ID = 0x1a45dfa3;
export const SEGMENT_ID = 0x18538067;
export const SEEK_HEAD_ID = 0x114d9b74;
export const SEEK_ID = 0x4dbb;
export const SEEK_TARGET_ID = 0x53ab;
export const SEEK_POSITION_ID = 0x53ac;
export const INFO_ID = 0x1549a966;
export const TIMECODE_SCALE_ID = 0x2ad7b1;
export const TRACKS_ID = 0x1654ae6b;
export const TRACK_ENTRY_ID = 0xae;
export const TRACK_NUMBER_ID = 0xd7;
export const TRACK_UID_ID = 0x73c5;
export const TRACK_TYPE_ID = 0x83;
export const FLAG_DEFAULT_ID = 0x88;
export const FLAG_FORCED_ID = 0x55aa;
export const FLAG_HEARING_IMPAIRED_ID = 0x55ab;
export const CODEC_ID = 0x86;
export const CODEC_PRIVATE_ID = 0x63a2;
export const TRACK_NAME_ID = 0x536e;
export const TRACK_LANGUAGE_ID = 0x22b59c;
export const TRACK_LANGUAGE_BCP47_ID = 0x22b59d;
export const CONTENT_ENCODINGS_ID = 0x6d80;
export const CONTENT_ENCODING_ID = 0x6240;
export const CONTENT_ENCODING_SCOPE_ID = 0x5032;
export const CONTENT_ENCODING_TYPE_ID = 0x5033;
export const CONTENT_COMPRESSION_ID = 0x5034;
export const CONTENT_COMPRESSION_ALGORITHM_ID = 0x4254;
export const CONTENT_COMPRESSION_SETTINGS_ID = 0x4255;
export const CLUSTER_ID = 0x1f43b675;
export const CLUSTER_TIMECODE_ID = 0xe7;
export const SIMPLE_BLOCK_ID = 0xa3;
export const BLOCK_GROUP_ID = 0xa0;
export const BLOCK_ID = 0xa1;
export const BLOCK_DURATION_ID = 0x9b;
export const CUES_ID = 0x1c53bb6b;
export const TAGS_ID = 0x1254c367;
export const TAG_ID = 0x7373;
export const TAG_TARGETS_ID = 0x63c0;
export const TAG_TRACK_UID_ID = 0x63c5;
export const SIMPLE_TAG_ID = 0x67c8;
export const TAG_NAME_ID = 0x45a3;
export const TAG_STRING_ID = 0x4487;
export const ATTACHMENTS_ID = 0x1941a469;
export const CHAPTERS_ID = 0x1043a770;
export const VOID_ID = 0xec;
export const CRC32_ID = 0xbf;
export const CLUSTER_POSITION_ID = 0xa7;
export const CLUSTER_PREVIOUS_SIZE_ID = 0xab;
export const CLUSTER_SILENT_TRACKS_ID = 0x5854;
export const CLUSTER_ENCRYPTED_BLOCK_ID = 0xaf;

export const SUBTITLE_TRACK_TYPE = 0x11;

export const LEVEL_ONE_IDS: ReadonlySet<number> = new Set([
  CLUSTER_ID, CUES_ID, TAGS_ID, ATTACHMENTS_ID, CHAPTERS_ID, SEEK_HEAD_ID, INFO_ID, TRACKS_ID, VOID_ID, CRC32_ID,
]);

export const CLUSTER_CHILD_IDS: ReadonlySet<number> = new Set([
  CLUSTER_TIMECODE_ID, SIMPLE_BLOCK_ID, BLOCK_GROUP_ID, CLUSTER_POSITION_ID, CLUSTER_PREVIOUS_SIZE_ID,
  CLUSTER_SILENT_TRACKS_ID, CLUSTER_ENCRYPTED_BLOCK_ID, VOID_ID, CRC32_ID,
]);
