import wasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.wasm?url";
import { configureWasm, createRuntime, recognizeUnits, type NerRuntime } from "./inference";
import type { NerFailure, NerFileKeys, NerRequest, NerResponse } from "./protocol";

const scope = self as unknown as { postMessage(message: NerResponse): void };

let runtime: NerRuntime | null = null;
const cancelled = new Set<number>();

const post = (message: NerResponse): void => scope.postMessage(message);

const yieldToEventLoop = (): Promise<void> => new Promise((resolve) => setTimeout(resolve));

async function readCached(cache: Cache, key: string): Promise<Response> {
  const response = await cache.match(key);
  if (!response) throw new Error("corrupt");
  return response;
}

function classify(error: unknown): NerFailure {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "corrupt" || message === "vocabulary_incomplete") return "corrupt";
  return /memory|alloc|abort|OOM/i.test(message) ? "memory" : "load";
}

async function initialize(id: number, keys: NerFileKeys): Promise<void> {
  try {
    configureWasm(wasmUrl);
    const cache = await caches.open(keys.cacheName);
    const [config, vocabularyText, modelBuffer] = await Promise.all([
      readCached(cache, keys.config).then((response) => response.json()),
      readCached(cache, keys.vocabulary).then((response) => response.text()),
      readCached(cache, keys.model).then((response) => response.arrayBuffer()),
    ]);
    runtime = await createRuntime({ modelBytes: new Uint8Array(modelBuffer), config, vocabularyText, providers: keys.providers });
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
