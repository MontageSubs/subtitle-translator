const MUSIC_NOTE_CHARS = "\u2669\u266a\u266b\u266c";

export const MUSIC_NOTE_PATTERN = new RegExp(`[${MUSIC_NOTE_CHARS}]`);
export const MUSIC_NOTE_GLOBAL_PATTERN = new RegExp(`[${MUSIC_NOTE_CHARS}]`, "g");
export const WHITESPACE_PATTERN = /\s+/g;
export const COLON = ":";
