import type { Word } from "./tokenizers/contract";

export interface NerEntity {
  text: string;
  type: string;
  score: number;
  start: number;
  end: number;
}

export type LabelScheme = "prefixed" | "plain";

const OUTSIDE_LABEL = "O";
const BEGIN_TAG = "B";

const parseLabel = (label: string, scheme: LabelScheme): { begins: boolean; type: string } =>
  scheme === "plain" ? { begins: false, type: label } : { begins: label.slice(0, 1) === BEGIN_TAG, type: label.slice(2) };

export function softmaxMax(logits: ArrayLike<number>, offset: number, width: number): { label: number; probability: number } {
  let best = 0;
  let max = -Infinity;
  for (let index = 0; index < width; index++) {
    const value = logits[offset + index];
    if (value > max) {
      max = value;
      best = index;
    }
  }
  let total = 0;
  for (let index = 0; index < width; index++) total += Math.exp(logits[offset + index] - max);
  return { label: best, probability: 1 / total };
}

export function assembleEntities(text: string, words: Word[], labels: readonly string[], probabilities: readonly number[], scheme: LabelScheme): NerEntity[] {
  const entities: NerEntity[] = [];
  let open: { type: string; first: number; last: number; scores: number[] } | null = null;
  const close = (): void => {
    if (!open) return;
    const start = words[open.first].start;
    const end = words[open.last].end;
    entities.push({
      text: text.slice(start, end).replace(/\s+/g, " ").trim(),
      type: open.type,
      score: open.scores.reduce((sum, score) => sum + score, 0) / open.scores.length,
      start,
      end,
    });
    open = null;
  };
  labels.forEach((label, index) => {
    if (label === OUTSIDE_LABEL) return close();
    const { begins, type } = parseLabel(label, scheme);
    if (!open || begins || open.type !== type) {
      close();
      open = { type, first: index, last: index, scores: [probabilities[index]] };
      return;
    }
    open.last = index;
    open.scores.push(probabilities[index]);
  });
  close();
  return entities;
}
