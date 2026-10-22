import { TAIL_CLOSED, TAIL_CONTINUATION, TAIL_DASH, TAIL_ELLIPSIS, TAIL_END_SHIFT, TAIL_TERMINAL, skipLeading, type CueEdges } from "../../extract/edges";
import { SCENE_ADJACENCY_MS } from "../../extract/timing";
import { createEdgeTokenizer } from "./edgeTokens";

export type ContinuationRule = (previous: CueEdges, current: CueEdges, gapMs: number) => boolean;

export interface CjkLexicon {
  readonly locale: string;
  readonly noCueStart: readonly string[];
  readonly noCueEnd: readonly string[];
  readonly noCueEndPhrases: readonly string[];
  readonly completeEndings: readonly string[];
  readonly sentenceStarts: readonly string[];
  readonly continuationStarts: readonly string[];
  readonly turnStarts: string;
}

const STRONG_END = TAIL_TERMINAL | TAIL_ELLIPSIS | TAIL_CLOSED | TAIL_DASH;

function indexByFirstChar(words: readonly string[]): (text: string, index: number) => boolean {
  const byChar = new Map<string, string[]>();
  for (const word of words) byChar.set(word[0]!, [...(byChar.get(word[0]!) ?? []), word]);
  return (text, index) => byChar.get(text[index] ?? "")?.some((word) => text.startsWith(word, index)) ?? false;
}

function indexByLastChar(words: readonly string[]): (text: string, end: number) => boolean {
  const byChar = new Map<string, string[]>();
  for (const word of words) byChar.set(word.at(-1)!, [...(byChar.get(word.at(-1)!) ?? []), word]);
  return (text, end) => byChar.get(text[end - 1] ?? "")?.some((word) => text.startsWith(word, end - word.length)) ?? false;
}

export function createCjkContinuation(lexicon: CjkLexicon): ContinuationRule {
  const tokenizer = createEdgeTokenizer(lexicon.locale);
  const startTokens = new Set(lexicon.noCueStart);
  const endTokens = new Set(lexicon.noCueEnd);
  const turnStarts = new Set(lexicon.turnStarts);
  const mayStartBound = indexByFirstChar(lexicon.noCueStart);
  const mayEndUnfinished = indexByLastChar(lexicon.noCueEnd);
  const endsWithPhrase = indexByLastChar(lexicon.noCueEndPhrases);
  const endsComplete = indexByLastChar(lexicon.completeEndings);
  const startsNewSentence = indexByFirstChar(lexicon.sentenceStarts);
  const continuesWith = indexByFirstChar(lexicon.continuationStarts);

  const isTurnStart = (text: string, index: number): boolean => turnStarts.has(text[index] ?? "") || startsNewSentence(text, index);
  const endsUnfinished = (text: string, end: number): boolean =>
    endsWithPhrase(text, end) || (mayEndUnfinished(text, end) && !endsComplete(text, end) && endTokens.has(tokenizer.last(text, end)));
  const startsBound = (text: string, index: number): boolean => mayStartBound(text, index) && startTokens.has(tokenizer.first(text, index));

  return (previous, current, gapMs) => {
    const { tail } = previous;
    if (tail & STRONG_END || gapMs > SCENE_ADJACENCY_MS) return false;
    const index = skipLeading(current.text);
    if (tail & TAIL_CONTINUATION || endsUnfinished(previous.text, tail >> TAIL_END_SHIFT)) return !isTurnStart(current.text, index);
    return startsBound(current.text, index) || continuesWith(current.text, index);
  };
}
