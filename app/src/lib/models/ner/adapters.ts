import { ModelError } from "../runtime/errors";
import type { NerCodec } from "./inference";
import { createUnigramTokenizer } from "./tokenizers/unigram";
import { createWordPieceTokenizer } from "./tokenizers/wordpiece";

export interface NerConfig {
  id2label?: Record<string, string>;
}

export interface NerAdapter {
  id: string;
  vocabularyRole: string;
  build(config: NerConfig, vocabularyText: string): NerCodec;
}

const JAPANESE_DEFAULT_LABELS: readonly string[] = ["O", "PER", "ORG", "ORG-P", "ORG-O", "LOC", "INS", "PRD", "EVT"];
const GENERIC_LABEL_PATTERN = /^LABEL_\d+$/;
const JAPANESE_LABEL_TYPES: Readonly<Record<string, string>> = { "ORG-P": "ORG", "ORG-O": "ORG", INS: "LOC" };

function declaredLabels(config: NerConfig, fallback?: readonly string[]): string[] {
  const map = config.id2label ?? {};
  const names = Object.values(map);
  if (names.length && !names.every((label) => GENERIC_LABEL_PATTERN.test(label))) {
    return names.map((_, index) => {
      const label = map[String(index)];
      if (label === undefined) throw new ModelError("corrupt");
      return label;
    });
  }
  if (fallback) return [...fallback];
  throw new ModelError("corrupt");
}

const readLabels = (config: NerConfig, aliases: Readonly<Record<string, string>> = {}, fallback?: readonly string[]): string[] =>
  declaredLabels(config, fallback).map((label) => aliases[label] ?? label);

const ADAPTERS: readonly NerAdapter[] = [
  {
    id: "ner-wordpiece@1",
    vocabularyRole: "vocabulary",
    build: (config, vocabularyText) => ({ tokenizer: createWordPieceTokenizer(vocabularyText), scheme: "prefixed", labels: readLabels(config) }),
  },
  {
    id: "ner-unigram@1",
    vocabularyRole: "tokenizer",
    build: (config, vocabularyText) => ({ tokenizer: createUnigramTokenizer(vocabularyText), scheme: "plain", labels: readLabels(config, JAPANESE_LABEL_TYPES, JAPANESE_DEFAULT_LABELS) }),
  },
];

export function resolveNerAdapter(id: string): NerAdapter {
  const adapter = ADAPTERS.find((candidate) => candidate.id === id);
  if (!adapter) throw new ModelError("incompatible");
  return adapter;
}
