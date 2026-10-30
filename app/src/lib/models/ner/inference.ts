import type * as OrtApi from "onnxruntime-web";
import { ModelError } from "../runtime/errors";
import { assembleEntities, softmaxMax, type LabelScheme, type NerEntity } from "./decode";
import type { NerTokenizer, Word } from "./tokenizers/contract";

const MAX_SEQUENCE_TOKENS = 512;
const SPECIAL_TOKENS = 2;
const MAX_WORD_PIECES = MAX_SEQUENCE_TOKENS - SPECIAL_TOKENS;

export interface NerCodec {
  tokenizer: NerTokenizer;
  scheme: LabelScheme;
  labels: readonly string[];
}

export type NerBackend = "webgpu" | "wasm";

type Ort = typeof OrtApi;

export interface NerRuntime {
  ort: Ort;
  backend: NerBackend;
  session: OrtApi.InferenceSession;
  codec: NerCodec;
  inputNames: readonly string[];
  outputName: string;
}

export interface RuntimeSources {
  backend: NerBackend;
  modelBytes: Uint8Array;
  codec: NerCodec;
  wasmPaths: { mjs: string; wasm: string };
}

const MAX_WASM_THREADS = 4;
const WINDOW_PIECES = 192;
const MAX_BATCH_SEQUENCES = 8;
const MAX_BATCH_TOKENS = 1536;

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

const loadOrt = (backend: NerBackend): Promise<Ort> => (backend === "webgpu" ? import("onnxruntime-web/webgpu") : import("onnxruntime-web/wasm"));

const wasmThreads = (): number => (self.crossOriginIsolated ? Math.max(1, Math.min(MAX_WASM_THREADS, Math.floor((navigator.hardwareConcurrency || 2) / 2))) : 1);

export async function createRuntime({ backend, modelBytes, codec, wasmPaths }: RuntimeSources): Promise<NerRuntime> {
  const ort = await loadOrt(backend);
  ort.env.wasm.numThreads = wasmThreads();
  ort.env.wasm.wasmPaths = wasmPaths;
  const session = await ort.InferenceSession.create(modelBytes, { executionProviders: [backend], graphOptimizationLevel: "extended" });
  if (!session.inputNames.includes("input_ids") || !session.inputNames.includes("attention_mask")) {
    await session.release();
    throw new ModelError("incompatible");
  }
  return { ort, backend, session, codec, inputNames: session.inputNames, outputName: session.outputNames[0] };
}

function buildFeeds(runtime: NerRuntime, batch: readonly Sequence[]): Record<string, OrtApi.Tensor> {
  const { ort } = runtime;
  const width = Math.max(...batch.map(({ pieces }) => pieces.length)) + SPECIAL_TOKENS;
  const { tokenizer } = runtime.codec;
  const ids = new BigInt64Array(batch.length * width).fill(BigInt(tokenizer.padding));
  const mask = new BigInt64Array(batch.length * width);
  batch.forEach(({ pieces }, row) => {
    const sequence = [tokenizer.classify, ...pieces, tokenizer.separate];
    sequence.forEach((id, column) => {
      ids[row * width + column] = BigInt(id);
      mask[row * width + column] = 1n;
    });
  });
  const shape = [batch.length, width];
  const candidates: Record<string, () => OrtApi.Tensor> = {
    input_ids: () => new ort.Tensor("int64", ids, shape),
    attention_mask: () => new ort.Tensor("int64", mask, shape),
    token_type_ids: () => new ort.Tensor("int64", new BigInt64Array(batch.length * width), shape),
  };
  return Object.fromEntries(runtime.inputNames.filter((name) => name in candidates).map((name) => [name, candidates[name]()]));
}

const pieceCount = (word: Word): number => Math.min(word.pieces.length, MAX_WORD_PIECES);

function packWindows(units: readonly string[], tokenizer: NerTokenizer): TextWindow[] {
  const windows: TextWindow[] = [];
  let current: TextWindow = { text: "", members: [] };
  let pieces = 0;
  units.forEach((unit, index) => {
    const count = tokenizer.words(unit).reduce((total, word) => total + pieceCount(word), 0) + 1;
    if (current.members.length && pieces + count > WINDOW_PIECES) {
      windows.push(current);
      current = { text: "", members: [] };
      pieces = 0;
    }
    const start = current.text ? current.text.length + tokenizer.unitSeparator.length : 0;
    current.text = current.text ? current.text + tokenizer.unitSeparator + unit : unit;
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
  const { tokenizer, labels: labelSet, scheme } = runtime.codec;
  const sequences = packWindows(units, tokenizer).flatMap((window) =>
    slicesOf(tokenizer.words(window.text)).map((words): Sequence => ({ window, words, pieces: words.flatMap((word) => word.pieces.slice(0, MAX_WORD_PIECES)) })),
  );
  const width = labelSet.length;
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
        labels.push(labelSet[label]);
        probabilities.push(probability);
        cursor += pieceCount(word);
      }
      attribute(assembleEntities(window.text, words, labels, probabilities, scheme), window, results);
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

