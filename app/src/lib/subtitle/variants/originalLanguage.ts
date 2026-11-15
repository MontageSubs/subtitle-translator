import { detectTextLanguages, normalizeDetectedCode } from "../../../utils/detect";
import type { MatroskaAudioTrack } from "../container/matroska/tracks";
import { baseLanguage } from "../common/languageCodes";
import { resolveTrackLanguageHint, selectableTagFor } from "./trackLanguage";

const MAX_TITLE_WORDS = 6;
const WORD_SEPARATORS = /[._\-\s]+/;
const BRACKETED_RELEASE_INFO = /[\[(（【][^\]）)】]*[\]）)】]/g;
const RELEASE_STOP_WORD = /^(?:(?:19|20)\d{2}|\d{3,4}[pi]|[248]k|uhd|hdr\d*|dv|bluray|blu|ray|bdrip|brrip|webrip|web|dl|hdtv|dvdrip|remux|x26[45]|h26[45]|hevc|avc|aac\d*|ac3|dts|flac|atmos|ddp?\d*|10bit|proper|repack|extended|unrated|s\d{1,2}e\d{1,3}|e\d{1,3}|season|episode)$/i;
const LATIN_WORD = /^[\p{Script=Latin}\p{N}'’]+$/u;

export const dedupeByBaseLanguage = (languages: readonly string[]): string[] => {
  const seen = new Set<string>();
  return languages.filter((language) => !seen.has(baseLanguage(language)) && seen.add(baseLanguage(language)));
};

export function audioLanguagesOf(audioTracks: readonly MatroskaAudioTrack[]): string[] {
  const ordered = [...audioTracks].sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
  return dedupeByBaseLanguage(ordered.flatMap((track) => resolveTrackLanguageHint({ language: track.language, languageTag: track.languageTag, name: null }).primary ?? []));
}

export function titleWordsOf(baseName: string): string[] {
  const words = baseName.replace(BRACKETED_RELEASE_INFO, " ").split(WORD_SEPARATORS).filter(Boolean);
  const stop = words.findIndex((word) => RELEASE_STOP_WORD.test(word));
  return (stop < 0 ? words : words.slice(0, stop)).slice(0, MAX_TITLE_WORDS);
}

function scriptRunsOf(words: readonly string[]): string[] {
  const latin = words.filter((word) => LATIN_WORD.test(word));
  const native = words.filter((word) => !LATIN_WORD.test(word));
  return [native.join(" "), latin.join(" ")].filter((run) => run.length > 0);
}

export async function titleLanguagesOf(baseName: string): Promise<string[]> {
  const runs = scriptRunsOf(titleWordsOf(baseName));
  if (!runs.length) return [];
  const detected = await detectTextLanguages(runs);
  return dedupeByBaseLanguage(detected.flatMap((result) => (result?.reliable ? selectableTagFor(normalizeDetectedCode(result.code)) ?? [] : [])));
}

export async function originalLanguagesOf(baseName: string, audioLanguages: readonly string[]): Promise<string[]> {
  return dedupeByBaseLanguage([...audioLanguages, ...(await titleLanguagesOf(baseName))]);
}
