import type { CliticRules, RecognitionProfile } from "../profile";

export interface Token {
  start: number;
  end: number;
  stemEnd: number;
  text: string;
  form: string;
  key: string;
  numeric: boolean;
}

export interface Tokenizer {
  tokenize(text: string, breaks: readonly number[]): Token[];
}

const NUMERIC_PATTERN = /^[\p{N}\p{P}\p{S}]+$/u;
const REPLACEMENT_CHARACTER_PATTERN = /\uFFFD/g;
const REPLACEMENT_STAND_IN = "\u00e9";
const SPACED_WORD_PATTERN = /[\p{L}\uFFFD][\p{L}\p{M}\uFFFD'’]*|\p{N}+/gu;
const UNSPACED_UNIT_PATTERN = /[\p{L}\uFFFD]|\p{N}+/gu;
const WORD_CHARACTER_PATTERN = /[\p{L}\p{N}\uFFFD]/u;
const MIN_PREFIXED_REMAINDER = 2;

const SENTENCE_BREAK_PATTERN = /[.!?…。！？؟]/;

export const isSentenceInitial = (text: string, tokens: readonly Token[], index: number): boolean => index === 0 || SENTENCE_BREAK_PATTERN.test(text.slice(tokens[index - 1].end, tokens[index].start));

function makeToken(text: string, start: number, clitics: CliticRules): Token {
  const folded = text.normalize("NFKC");
  const prefixLength = clitics.prefix?.exec(folded)?.[0].length ?? 0;
  const prefixed = prefixLength > 0 && folded.length - prefixLength >= MIN_PREFIXED_REMAINDER;
  const head = prefixed ? prefixLength : 0;
  const suffixLength = clitics.suffix?.exec(folded.slice(head))?.[0].length ?? 0;
  const stemLength = folded.length - head - suffixLength;
  const stemmed = suffixLength > 0 && stemLength > 0;
  const form = folded.slice(head, stemmed ? head + stemLength : undefined);
  const tokenText = text.slice(head);
  const begin = start + head;
  const end = start + text.length;
  return { start: begin, end, stemEnd: stemmed ? end - suffixLength : end, text: tokenText, form, key: form.toLowerCase(), numeric: NUMERIC_PATTERN.test(text) };
}

function patternTokens(text: string, offset: number, pattern: RegExp, clitics: CliticRules): Token[] {
  return Array.from(text.matchAll(pattern), (match) => makeToken(match[0], offset + match.index!, clitics));
}

function chunkRanges(text: string, breaks: readonly number[]): [number, number][] {
  const edges = [0, ...breaks.filter((offset) => offset > 0 && offset < text.length), text.length];
  return edges.slice(1).map((edge, index): [number, number] => [edges[index], edge]);
}

export function createTokenizer(profile: RecognitionProfile): Tokenizer {
  const segmenter = typeof Intl.Segmenter === "function" ? new Intl.Segmenter(profile.locale, { granularity: "word" }) : null;
  const { clitics } = profile;
  const tokenizeChunk = (chunk: string, offset: number): Token[] => {
    if (!segmenter) return patternTokens(chunk, offset, profile.spaced ? SPACED_WORD_PATTERN : UNSPACED_UNIT_PATTERN, clitics);
    const tokens: Token[] = [];
    for (const part of segmenter.segment(chunk.replace(REPLACEMENT_CHARACTER_PATTERN, REPLACEMENT_STAND_IN))) {
      if (!part.isWordLike || !WORD_CHARACTER_PATTERN.test(part.segment)) continue;
      tokens.push(makeToken(chunk.slice(part.index, part.index + part.segment.length), offset + part.index, clitics));
    }
    return tokens;
  };
  return {
    tokenize: (text, breaks) => (profile.spaced || !breaks.length ? tokenizeChunk(text, 0) : chunkRanges(text, breaks).flatMap(([from, to]) => tokenizeChunk(text.slice(from, to), from))),
  };
}
