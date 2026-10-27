import * as ort from "onnxruntime-web/wasm";
import { assembleEntities, softmaxMax, type NerEntity } from "./decode";
import { parseVocabulary, splitWords, type Vocabulary, type Word } from "./tokenizer";

const MAX_SEQUENCE_TOKENS = 512;
const SPECIAL_TOKENS = 2;
const MAX_WORD_PIECES = MAX_SEQUENCE_TOKENS - SPECIAL_TOKENS;

export interface NerRuntime {
  session: ort.InferenceSession;
  vocabulary: Vocabulary;
  labels: string[];
  inputNames: readonly string[];
  outputName: string;
}

export interface RuntimeSources {
  modelBytes: Uint8Array;
  config: { id2label?: Record<string, string> };
  vocabularyText: string;
}

function labelsFrom(config: RuntimeSources["config"]): string[] {
  const entries = Object.entries(config.id2label ?? {});
  if (!entries.length) throw new Error("corrupt");
  const labels: string[] = [];
  for (const [index, label] of entries) labels[Number(index)] = label;
  return labels;
}

export async function createRuntime({ modelBytes, config, vocabularyText }: RuntimeSources): Promise<NerRuntime> {
  const session = await ort.InferenceSession.create(modelBytes, { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
  return { session, vocabulary: parseVocabulary(vocabularyText), labels: labelsFrom(config), inputNames: session.inputNames, outputName: session.outputNames[0] };
}

export const configureWasm = (wasmUrl?: string): void => {
  ort.env.wasm.numThreads = 1;
  if (wasmUrl) ort.env.wasm.wasmPaths = { wasm: wasmUrl };
};

function buildFeeds(runtime: NerRuntime, pieces: number[]): Record<string, ort.Tensor> {
  const ids = [runtime.vocabulary.classify, ...pieces, runtime.vocabulary.separate];
  const shape = [1, ids.length];
  const tensor = (values: number[]): ort.Tensor => new ort.Tensor("int64", BigInt64Array.from(values, BigInt), shape);
  const candidates: Record<string, () => ort.Tensor> = {
    input_ids: () => tensor(ids),
    attention_mask: () => tensor(ids.map(() => 1)),
    token_type_ids: () => tensor(ids.map(() => 0)),
  };
  return Object.fromEntries(runtime.inputNames.filter((name) => name in candidates).map((name) => [name, candidates[name]()]));
}

function slicesOf(words: Word[]): Word[][] {
  const slices: Word[][] = [];
  let current: Word[] = [];
  let pieces = 0;
  for (const word of words) {
    const count = Math.min(word.pieces.length, MAX_WORD_PIECES);
    if (current.length && pieces + count > MAX_WORD_PIECES) {
      slices.push(current);
      current = [];
      pieces = 0;
    }
    current.push(word);
    pieces += count;
  }
  if (current.length) slices.push(current);
  return slices;
}

export async function recognizeChunk(runtime: NerRuntime, text: string): Promise<NerEntity[]> {
  const entities: NerEntity[] = [];
  const width = runtime.labels.length;
  for (const slice of slicesOf(splitWords(text, runtime.vocabulary))) {
    const pieces = slice.flatMap((word) => word.pieces.slice(0, MAX_WORD_PIECES));
    const outputs = await runtime.session.run(buildFeeds(runtime, pieces));
    const data = outputs[runtime.outputName].data as Float32Array;
    const labels: string[] = [];
    const probabilities: number[] = [];
    let cursor = 1;
    for (const word of slice) {
      const { label, probability } = softmaxMax(data, cursor * width, width);
      labels.push(runtime.labels[label]);
      probabilities.push(probability);
      cursor += Math.min(word.pieces.length, MAX_WORD_PIECES);
    }
    entities.push(...assembleEntities(text, slice, labels, probabilities));
  }
  return entities;
}
