import wasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.wasm?url";
import { configureWasm, createRuntime, recognizeUnits, type NerRuntime } from "./inference";
import { ModelError } from "../runtime/errors";
import { resolveNerAdapter, type NerConfig } from "./adapters";
import type { NerFailure, NerFileKeys, NerRequest, NerResponse } from "./protocol";

const scope = self as unknown as { postMessage(message: NerResponse): void };

let runtime: NerRuntime | null = null;
const cancelled = new Set<number>();

const post = (message: NerResponse): void => scope.postMessage(message);

const yieldToEventLoop = (): Promise<void> => new Promise((resolve) => setTimeout(resolve));

async function readCached(cache: Cache, key: string): Promise<Response> {
  const response = await cache.match(key);
  if (!response) throw new ModelError("corrupt");
  return response;
}

function classify(error: unknown): NerFailure {
  if (error instanceof ModelError) return error.code === "missing" || error.code === "internal" ? "load" : error.code;
  const message = error instanceof Error ? error.message : String(error);
  return /memory|alloc|abort|OOM/i.test(message) ? "memory" : "load";
}

async function initialize(id: number, keys: NerFileKeys): Promise<void> {
  try {
    configureWasm(wasmUrl);
    const adapter = resolveNerAdapter(keys.adapter);
    const vocabularyKey = keys.files[adapter.vocabularyRole];
    if (!vocabularyKey) throw new ModelError("incompatible");
    const cache = await caches.open(keys.cacheName);
    const [config, vocabularyText, modelBuffer] = await Promise.all([
      readCached(cache, keys.files.config).then((response) => response.json() as Promise<NerConfig>),
      readCached(cache, vocabularyKey).then((response) => response.text()),
      readCached(cache, keys.files.model).then((response) => response.arrayBuffer()),
    ]);
    runtime = await createRuntime({ modelBytes: new Uint8Array(modelBuffer), codec: adapter.build(config, vocabularyText), providers: keys.providers });
    post({ type: "ready", id });
  } catch (error) {
    post({ type: "failure", id, failure: classify(error) });
  }
}

async function recognize(id: number, units: string[]): Promise<void> {
  if (!runtime) return post({ type: "failure", id, failure: "load" });
  try {
    const entities = await recognizeUnits(runtime, units, async () => {
      await yieldToEventLoop();
      return cancelled.delete(id);
    });
    post(entities ? { type: "result", id, entities } : { type: "failure", id, failure: "aborted" });
  } catch (error) {
    post({ type: "failure", id, failure: classify(error) });
  }
}

self.addEventListener("message", (event: MessageEvent<NerRequest>) => {
  const message = event.data;
  if (message.type === "initialize") void initialize(message.id, message.keys);
  else if (message.type === "recognize") void recognize(message.id, message.units);
  else if (message.type === "cancel") cancelled.add(message.id);
  else {
    void runtime?.session.release();
    runtime = null;
  }
});
