export interface Vocabulary {
  ids: ReadonlyMap<string, number>;
  unknown: number;
  classify: number;
  separate: number;
}

export interface Word {
  start: number;
  end: number;
  pieces: number[];
}

const MAX_WORD_CODE_POINTS = 100;
const CONTINUATION_PREFIX = "##";
const CJK_RANGES: readonly (readonly [number, number])[] = [
  [0x4e00, 0x9fff],
  [0x3400, 0x4dbf],
  [0x20000, 0x2a6df],
  [0x2a700, 0x2b73f],
  [0x2b740, 0x2b81f],
  [0x2b820, 0x2ceaf],
  [0xf900, 0xfaff],
  [0x2f800, 0x2fa1f],
];
const WHITESPACE_PATTERN = /^\s$/u;
const DROPPED_PATTERN = /^[\p{Cc}\p{Cf}\u0000\ufffd]$/u;
const PUNCTUATION_PATTERN = /^\p{P}$/u;

export function parseVocabulary(text: string): Vocabulary {
  const ids = new Map<string, number>();
  text.split("\n").forEach((line, index) => {
    const token = line.replace(/\r$/, "");
    if (token) ids.set(token, index);
  });
  const required = (token: string): number => {
    const id = ids.get(token);
    if (id === undefined) throw new Error("vocabulary_incomplete");
    return id;
  };
  return { ids, unknown: required("[UNK]"), classify: required("[CLS]"), separate: required("[SEP]") };
}

const isCjk = (codePoint: number): boolean => CJK_RANGES.some(([low, high]) => codePoint >= low && codePoint <= high);

const isAsciiSymbol = (codePoint: number): boolean => (codePoint >= 33 && codePoint <= 47) || (codePoint >= 58 && codePoint <= 64) || (codePoint >= 91 && codePoint <= 96) || (codePoint >= 123 && codePoint <= 126);

const isStandalone = (char: string, codePoint: number): boolean => isCjk(codePoint) || isAsciiSymbol(codePoint) || PUNCTUATION_PATTERN.test(char);

function wordPieces(characters: string[], vocabulary: Vocabulary): number[] {
  if (characters.length > MAX_WORD_CODE_POINTS) return [vocabulary.unknown];
  const pieces: number[] = [];
  let start = 0;
  while (start < characters.length) {
    let end = characters.length;
    let match: number | undefined;
    while (start < end && match === undefined) {
      const candidate = characters.slice(start, end).join("");
      match = vocabulary.ids.get(start > 0 ? CONTINUATION_PREFIX + candidate : candidate);
      if (match === undefined) end--;
    }
    if (match === undefined) return [vocabulary.unknown];
    pieces.push(match);
    start = end;
  }
  return pieces;
}

export function splitWords(text: string, vocabulary: Vocabulary): Word[] {
  const words: Word[] = [];
  let characters: string[] = [];
  let wordStart = 0;
  let offset = 0;
  const flush = (end: number): void => {
    if (characters.length) words.push({ start: wordStart, end, pieces: wordPieces(characters, vocabulary) });
    characters = [];
  };
  for (const char of text) {
    const codePoint = char.codePointAt(0)!;
    const next = offset + char.length;
    if (WHITESPACE_PATTERN.test(char)) flush(offset);
    else if (!DROPPED_PATTERN.test(char)) {
      if (isStandalone(char, codePoint)) {
        flush(offset);
        words.push({ start: offset, end: next, pieces: wordPieces([char], vocabulary) });
      } else {
        if (!characters.length) wordStart = offset;
        characters.push(char);
      }
    } else flush(offset);
    offset = next;
  }
  flush(offset);
  return words;
}
