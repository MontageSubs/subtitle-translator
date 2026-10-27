import type { SubtitleFile } from "../../pages/translator/state";
import { applySdhStripping } from "../subtitle/extraction/sdh";
import { scriptOf } from "../subtitle/common/languageCodes";
import { joinCueLines } from "../subtitle/extraction/styleWraps";

const LATIN_CHUNK_CHARS = 600;
const CJK_CHUNK_CHARS = 300;
const MARKUP_PATTERN = /<[^>]*>|\{\\[^}]*\}/g;
const MUSIC_PATTERN = /[♪♫♬#]/g;
const DIALOGUE_DASH_PATTERN = /(^|\s)[-–—]\s+/g;
const WHITESPACE_PATTERN = /\s+/g;
const MIN_SHOUTING_LETTERS = 3;
const SHOUTING_RATIO = 0.8;

function isShouting(text: string): boolean {
  const letters = text.match(/\p{L}/gu) ?? [];
  if (letters.length < MIN_SHOUTING_LETTERS) return false;
  return letters.filter((letter) => letter !== letter.toLowerCase()).length / letters.length >= SHOUTING_RATIO;
}

function cleanCueText(text: string): string {
  return joinCueLines(text).replace(MARKUP_PATTERN, " ").replace(MUSIC_PATTERN, " ").replace(DIALOGUE_DASH_PATTERN, "$1").replace(WHITESPACE_PATTERN, " ").trim();
}

export function buildRecognitionChunks(files: readonly SubtitleFile[], sourceLang: string, sdhEnabled: boolean): string[] {
  const limit = scriptOf(sourceLang) === "cjk" ? CJK_CHUNK_CHARS : LATIN_CHUNK_CHARS;
  const chunks: string[] = [];
  for (const file of files) {
    let current = "";
    for (const cue of applySdhStripping(file.cues, sourceLang, sdhEnabled).cues) {
      const text = cleanCueText(cue.text);
      if (!text || isShouting(text)) continue;
      if (current && current.length + text.length + 1 > limit) {
        chunks.push(current);
        current = "";
      }
      current = current ? `${current} ${text}` : text;
    }
    if (current) chunks.push(current);
  }
  return chunks;
}
