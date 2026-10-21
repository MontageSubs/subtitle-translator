import { TAIL_CLOSED, TAIL_CONTINUATION, TAIL_DASH, TAIL_ELLIPSIS, TAIL_END_SHIFT, TAIL_TERMINAL, skipLeading, type CueEdges } from "../../extract/edges";
import { GAP_THRESHOLD_MS, SCENE_ADJACENCY_MS } from "../../extract/timing";

export type ContinuationRule = (previous: CueEdges, current: CueEdges, gapMs: number) => boolean;

export interface CjkLexicon {
  readonly clauseLinks: readonly string[];
  readonly openEndings: readonly string[];
  readonly sentenceStarts: readonly string[];
  readonly continuationStarts: readonly string[];
  readonly turnStarts: string;
}

const STRONG_END = TAIL_TERMINAL | TAIL_ELLIPSIS | TAIL_CLOSED | TAIL_DASH;

const longest = (words: readonly string[]): number => words.reduce((max, word) => Math.max(max, word.length), 0);

function endsWithAny(text: string, end: number, words: ReadonlySet<string>, maxLength: number): boolean {
  for (let length = Math.min(maxLength, end); length > 0; length--) {
    if (words.has(text.slice(end - length, end))) return true;
  }
  return false;
}

function indexByFirstChar(words: readonly string[]): (text: string, index: number) => boolean {
  const byChar = new Map<string, string[]>();
  for (const word of words) byChar.set(word[0]!, [...(byChar.get(word[0]!) ?? []), word]);
  return (text, index) => byChar.get(text[index] ?? "")?.some((word) => text.startsWith(word, index)) ?? false;
}

export function createCjkContinuation(lexicon: CjkLexicon): ContinuationRule {
  const clauseLinks = new Set(lexicon.clauseLinks);
  const openEndings = new Set(lexicon.openEndings);
  const linkLength = longest(lexicon.clauseLinks);
  const openLength = longest(lexicon.openEndings);
  const turnStarts = new Set(lexicon.turnStarts);
  const startsWith = indexByFirstChar(lexicon.sentenceStarts);
  const continuesWith = indexByFirstChar(lexicon.continuationStarts);
  const hasContinuationStarts = lexicon.continuationStarts.length > 0;

  const startsNewSentence = (text: string): boolean => {
    const index = skipLeading(text);
    return turnStarts.has(text[index] ?? "") || startsWith(text, index);
  };

  return (previous, current, gapMs) => {
    const { tail } = previous;
    if (tail & STRONG_END || gapMs > SCENE_ADJACENCY_MS) return false;
    const end = tail >> TAIL_END_SHIFT;
    const linked = (tail & TAIL_CONTINUATION) !== 0 || endsWithAny(previous.text, end, clauseLinks, linkLength);
    const open = !linked && gapMs <= GAP_THRESHOLD_MS && endsWithAny(previous.text, end, openEndings, openLength);
    if (linked || open) return !startsNewSentence(current.text);
    return hasContinuationStarts && continuesWith(current.text, skipLeading(current.text));
  };
}
