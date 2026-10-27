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
  providers: readonly string[];
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

const BUNDLED_PROVIDERS: ReadonlySet<string> = new Set(["wasm"]);
const FALLBACK_PROVIDER = "wasm";
const WINDOW_PIECES = 192;
const MAX_BATCH_SEQUENCES = 8;
const MAX_BATCH_TOKENS = 1536;
const UNIT_SEPARATOR = " . ";
const PADDING_ID = 0;

interface WindowMember {
  unit: number;
  start: number;
  end: number;
}

interface TextWindow {
  text: string;
  members: WindowMember[];
}

interface Sequence {
  window: TextWindow;
  words: Word[];
  pieces: number[];
}

export async function createRuntime({ modelBytes, config, vocabularyText, providers }: RuntimeSources): Promise<NerRuntime> {
  const usable = providers.filter((provider) => BUNDLED_PROVIDERS.has(provider));
  const session = await ort.InferenceSession.create(modelBytes, { executionProviders: usable.length ? usable : [FALLBACK_PROVIDER], graphOptimizationLevel: "all" });
  return { session, vocabulary: parseVocabulary(vocabularyText), labels: labelsFrom(config), inputNames: session.inputNames, outputName: session.outputNames[0] };
}

export const configureWasm = (wasmUrl?: string): void => {
  ort.env.wasm.numThreads = 1;
  if (wasmUrl) ort.env.wasm.wasmPaths = { wasm: wasmUrl };
};

function buildFeeds(runtime: NerRuntime, batch: readonly Sequence[]): Record<string, ort.Tensor> {
  const width = Math.max(...batch.map(({ pieces }) => pieces.length)) + SPECIAL_TOKENS;
  const ids = new BigInt64Array(batch.length * width).fill(BigInt(PADDING_ID));
  const mask = new BigInt64Array(batch.length * width);
  batch.forEach(({ pieces }, row) => {
    const sequence = [runtime.vocabulary.classify, ...pieces, runtime.vocabulary.separate];
    sequence.forEach((id, column) => {
      ids[row * width + column] = BigInt(id);
      mask[row * width + column] = 1n;
    });
  });
  const shape = [batch.length, width];
  const candidates: Record<string, () => ort.Tensor> = {
    input_ids: () => new ort.Tensor("int64", ids, shape),
    attention_mask: () => new ort.Tensor("int64", mask, shape),
    token_type_ids: () => new ort.Tensor("int64", new BigInt64Array(batch.length * width), shape),
  };
  return Object.fromEntries(runtime.inputNames.filter((name) => name in candidates).map((name) => [name, candidates[name]()]));
}

const pieceCount = (word: Word): number => Math.min(word.pieces.length, MAX_WORD_PIECES);

function packWindows(units: readonly string[], vocabulary: Vocabulary): TextWindow[] {
  const windows: TextWindow[] = [];
  let current: TextWindow = { text: "", members: [] };
  let pieces = 0;
  units.forEach((unit, index) => {
    const count = splitWords(unit, vocabulary).reduce((total, word) => total + pieceCount(word), 0) + 1;
    if (current.members.length && pieces + count > WINDOW_PIECES) {
      windows.push(current);
      current = { text: "", members: [] };
      pieces = 0;
    }
    const start = current.text ? current.text.length + UNIT_SEPARATOR.length : 0;
    current.text = current.text ? current.text + UNIT_SEPARATOR + unit : unit;
    current.members.push({ unit: index, start, end: start + unit.length });
    pieces += count;
  });
  if (current.members.length) windows.push(current);
  return windows;
}

function batchSequences(sequences: Sequence[]): Sequence[][] {
  const ordered = [...sequences].sort((left, right) => right.pieces.length - left.pieces.length);
  const batches: Sequence[][] = [];
  let current: Sequence[] = [];
  for (const sequence of ordered) {
    const widest = current.length ? current[0].pieces.length : sequence.pieces.length;
    if (current.length && (current.length >= MAX_BATCH_SEQUENCES || (current.length + 1) * (widest + SPECIAL_TOKENS) > MAX_BATCH_TOKENS)) {
      batches.push(current);
      current = [];
    }
    current.push(sequence);
  }
  if (current.length) batches.push(current);
  return batches;
}

function attribute(entities: readonly NerEntity[], window: TextWindow, results: NerEntity[][]): void {
  for (const entity of entities) {
    const member = window.members.find(({ start, end }) => entity.start >= start && entity.end <= end);
    if (member) results[member.unit].push({ ...entity, start: entity.start - member.start, end: entity.end - member.start });
  }
}

export async function recognizeUnits(runtime: NerRuntime, units: readonly string[], shouldStop: () => Promise<boolean>): Promise<NerEntity[][] | null> {
  const results: NerEntity[][] = units.map(() => []);
  const sequences = packWindows(units, runtime.vocabulary).flatMap((window) =>
    slicesOf(splitWords(window.text, runtime.vocabulary)).map((words): Sequence => ({ window, words, pieces: words.flatMap((word) => word.pieces.slice(0, MAX_WORD_PIECES)) })),
  );
  const width = runtime.labels.length;
  for (const batch of batchSequences(sequences)) {
    if (await shouldStop()) return null;
    const outputs = await runtime.session.run(buildFeeds(runtime, batch));
    const data = outputs[runtime.outputName].data as Float32Array;
    const rowLength = (outputs[runtime.outputName].dims[1] as number) * width;
    batch.forEach(({ window, words }, row) => {
      const labels: string[] = [];
      const probabilities: number[] = [];
      let cursor = 1;
      for (const word of words) {
        const { label, probability } = softmaxMax(data, row * rowLength + cursor * width, width);
        labels.push(runtime.labels[label]);
        probabilities.push(probability);
        cursor += pieceCount(word);
      }
      attribute(assembleEntities(window.text, words, labels, probabilities), window, results);
    });
  }
  return results;
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

