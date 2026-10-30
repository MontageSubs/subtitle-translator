import type { RecognitionProfile } from "../profile";

export interface Token {
  start: number;
  end: number;
  text: string;
  key: string;
  numeric: boolean;
}

export interface Tokenizer {
  tokenize(text: string, breaks: readonly number[]): Token[];
}

const NUMERIC_PATTERN = /^[\p{N}\p{P}\p{S}]+$/u;
const SPACED_WORD_PATTERN = /\p{L}[\p{L}\p{M}'’]*|\p{N}+/gu;
const UNSPACED_UNIT_PATTERN = /\p{L}|\p{N}+/gu;
const WORD_CHARACTER_PATTERN = /[\p{L}\p{N}]/u;

const SENTENCE_BREAK_PATTERN = /[.!?…。！？؟]/;

export const isSentenceInitial = (text: string, tokens: readonly Token[], index: number): boolean => index === 0 || SENTENCE_BREAK_PATTERN.test(text.slice(tokens[index - 1].end, tokens[index].start));

const foldKey = (text: string): string => text.normalize("NFKC").toLowerCase();

const makeToken = (text: string, start: number): Token => ({ start, end: start + text.length, text, key: foldKey(text), numeric: NUMERIC_PATTERN.test(text) });

function patternTokens(text: string, offset: number, pattern: RegExp): Token[] {
  return Array.from(text.matchAll(pattern), (match) => makeToken(match[0], offset + match.index!));
}

function chunkRanges(text: string, breaks: readonly number[]): [number, number][] {
  const edges = [0, ...breaks.filter((offset) => offset > 0 && offset < text.length), text.length];
  return edges.slice(1).map((edge, index): [number, number] => [edges[index], edge]);
}

export function createTokenizer(profile: RecognitionProfile): Tokenizer {
  const segmenter = typeof Intl.Segmenter === "function" ? new Intl.Segmenter(profile.locale, { granularity: "word" }) : null;
  const tokenizeChunk = (chunk: string, offset: number): Token[] => {
    if (!segmenter) return patternTokens(chunk, offset, profile.spaced ? SPACED_WORD_PATTERN : UNSPACED_UNIT_PATTERN);
    const tokens: Token[] = [];
    for (const part of segmenter.segment(chunk)) if (part.isWordLike && WORD_CHARACTER_PATTERN.test(part.segment)) tokens.push(makeToken(part.segment, offset + part.index));
    return tokens;
  };
  return {
    tokenize: (text, breaks) => (profile.spaced || !breaks.length ? tokenizeChunk(text, 0) : chunkRanges(text, breaks).flatMap(([from, to]) => tokenizeChunk(text.slice(from, to), from))),
  };
}
