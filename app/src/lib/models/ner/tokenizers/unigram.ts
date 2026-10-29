import { ModelError } from "../../runtime/errors";
import type { NerTokenizer, Word } from "./contract";

interface UnigramDefinition {
  model: { type: string; unk_id: number; vocab: [string, number][] };
}

interface Piece {
  id: number;
  score: number;
}

interface NormalizedText {
  chars: string[];
  origins: number[];
  ends: number[];
}

const WORD_BOUNDARY = "\u2581";
const CLASSIFY_PIECE = "<s>";
const SEPARATE_PIECE = "</s>";
const PADDING_PIECE = "<pad>";
const UNKNOWN_PENALTY = 10;
const MAX_PIECE_CODE_POINTS = 24;
const UNIT_SEPARATOR = "\u3002";
const DROPPED_PATTERN = /^[\p{Cc}\p{Cf}\ufffd]$/u;
const SPACE_PATTERN = /^\s$/u;

function parseDefinition(text: string): UnigramDefinition {
  const definition = JSON.parse(text) as UnigramDefinition;
  if (definition.model?.type !== "Unigram" || !Array.isArray(definition.model.vocab)) throw new ModelError("incompatible");
  return definition;
}

function normalize(text: string): NormalizedText {
  const chars: string[] = [];
  const origins: number[] = [];
  const ends: number[] = [];
  let offset = 0;
  let pendingSpace = false;
  for (const original of text) {
    const next = offset + original.length;
    const folded = original.normalize("NFKC");
    if (SPACE_PATTERN.test(folded) || DROPPED_PATTERN.test(original)) {
      pendingSpace ||= SPACE_PATTERN.test(folded);
    } else {
      if (pendingSpace && chars.length) {
        chars.push(WORD_BOUNDARY);
        origins.push(offset);
        ends.push(offset);
      }
      pendingSpace = false;
      for (const char of folded) {
        chars.push(char);
        origins.push(offset);
        ends.push(next);
      }
    }
    offset = next;
  }
  return { chars, origins, ends };
}

export function createUnigramTokenizer(definitionText: string): NerTokenizer {
  const { model } = parseDefinition(definitionText);
  const pieces = new Map<string, Piece>();
  const idOf = new Map<string, number>();
  let minimumScore = 0;
  model.vocab.forEach(([piece, score], id) => {
    pieces.set(piece, { id, score });
    idOf.set(piece, id);
    if (score < minimumScore) minimumScore = score;
  });
  const required = (piece: string): number => {
    const id = idOf.get(piece);
    if (id === undefined) throw new ModelError("corrupt");
    return id;
  };
  const classify = required(CLASSIFY_PIECE);
  const separate = required(SEPARATE_PIECE);
  const padding = required(PADDING_PIECE);
  const unknownScore = minimumScore - UNKNOWN_PENALTY;

  function segment(chars: readonly string[]): { id: number; from: number; to: number }[] {
    const size = chars.length;
    const best = new Array<number>(size + 1).fill(-Infinity);
    const back = new Array<number>(size + 1).fill(0);
    const backId = new Array<number>(size + 1).fill(model.unk_id);
    best[0] = 0;
    for (let end = 1; end <= size; end++) {
      for (let from = Math.max(0, end - MAX_PIECE_CODE_POINTS); from < end; from++) {
        if (best[from] === -Infinity) continue;
        const piece = pieces.get(chars.slice(from, end).join(""));
        const score = piece ? piece.score : end - from === 1 ? unknownScore : undefined;
        if (score === undefined || best[from] + score <= best[end]) continue;
        best[end] = best[from] + score;
        back[end] = from;
        backId[end] = piece ? piece.id : model.unk_id;
      }
    }
    const path: { id: number; from: number; to: number }[] = [];
    for (let end = size; end > 0; end = back[end]) {
      const entry = { id: backId[end], from: back[end], to: end };
      const following = path[path.length - 1];
      if (entry.id === model.unk_id && following?.id === model.unk_id && following.from === entry.to) following.from = entry.from;
      else path.push(entry);
    }
    return path.reverse();
  }

  function words(text: string): Word[] {
    const { chars, origins, ends } = normalize(text);
    if (!chars.length) return [];
    const tokens = segment([WORD_BOUNDARY, ...chars.map((char) => char)]);
    const result: Word[] = [];
    for (const { id, from, to } of tokens) {
      const first = Math.max(from, 1) - 1;
      const last = to - 2;
      if (last < first) continue;
      result.push({ start: origins[first], end: ends[last], pieces: [id] });
    }
    return result;
  }

  return { classify, separate, padding, unitSeparator: UNIT_SEPARATOR, words };
}
