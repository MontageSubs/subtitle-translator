import { createRuntime, recognizeUnits, type NerBackend, type NerRuntime } from "./inference";
import { ModelError } from "../runtime/errors";
import { resolveRuntimePaths } from "../runtime/ortAssets";
import { hasWebGpu } from "../webgpuProbe";
import { resolveNerAdapter, type NerConfig } from "./adapters";
import type { NerFailure, NerFileKeys, NerRequest, NerResponse } from "./protocol";

const WEBGPU_MODEL_ROLE = "modelWebgpu";
const WEBGPU_BUILD_DEADLINE_MS = 25_000;

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

async function buildRuntime(keys: NerFileKeys, backend: NerBackend): Promise<NerRuntime> {
  const adapter = resolveNerAdapter(keys.adapter);
  const vocabularyKey = keys.files[adapter.vocabularyRole];
  const modelKey = backend === "webgpu" ? keys.files[WEBGPU_MODEL_ROLE] : keys.files.model;
  if (!vocabularyKey || !modelKey) throw new ModelError("incompatible");
  const cache = await caches.open(keys.cacheName);
  const [config, vocabularyText, modelBuffer, wasmPaths] = await Promise.all([
    readCached(cache, keys.files.config).then((response) => response.json() as Promise<NerConfig>),
    readCached(cache, vocabularyKey).then((response) => response.text()),
    readCached(cache, modelKey).then((response) => response.arrayBuffer()),
    resolveRuntimePaths(backend),
  ]);
  return createRuntime({ backend, modelBytes: new Uint8Array(modelBuffer), codec: adapter.build(config, vocabularyText), wasmPaths });
}

async function preferredBackends(keys: NerFileKeys): Promise<NerBackend[]> {
  const webgpu = keys.providers.includes("webgpu") && WEBGPU_MODEL_ROLE in keys.files && (await hasWebGpu());
  return webgpu ? ["webgpu", "wasm"] : ["wasm"];
}

async function buildWithinDeadline(keys: NerFileKeys, backend: NerBackend): Promise<NerRuntime> {
  if (backend !== "webgpu") return buildRuntime(keys, backend);
  await resolveRuntimePaths(backend);
  const building = buildRuntime(keys, backend);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ModelError("load")), WEBGPU_BUILD_DEADLINE_MS);
  });
  try {
    return await Promise.race([building, deadline]);
  } catch (error) {
    void building.then((late) => late.session.release()).catch(() => undefined);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function buildWithFallback(keys: NerFileKeys, backends: readonly NerBackend[]): Promise<NerRuntime> {
  let failure: unknown;
  for (const backend of backends) {
    try {
      return await buildWithinDeadline(keys, backend);
    } catch (error) {
      failure = error;
    }
  }
  throw failure;
}

export type NerHost = (message: NerRequest) => void;

export function createNerHost(post: (message: NerResponse) => void): NerHost {
  let runtime: NerRuntime | null = null;
  let fileKeys: NerFileKeys | null = null;
  const cancelled = new Set<number>();

  async function initialize(id: number, keys: NerFileKeys): Promise<void> {
    try {
      fileKeys = keys;
      runtime = await buildWithFallback(keys, await preferredBackends(keys));
      post({ type: "ready", id, backend: runtime.backend });
    } catch (error) {
      post({ type: "failure", id, failure: classify(error) });
    }
  }

  async function run(units: string[], id: number): Promise<NerResponse> {
    const entities = await recognizeUnits(runtime!, units, async () => {
      await yieldToEventLoop();
      return cancelled.has(id);
    }).finally(() => cancelled.delete(id));
    return entities ? { type: "result", id, entities } : { type: "failure", id, failure: "aborted" };
  }

  async function recognize(id: number, units: string[]): Promise<void> {
    if (!runtime || !fileKeys) return post({ type: "failure", id, failure: "load" });
    try {
      post(await run(units, id));
    } catch (error) {
      if (runtime.backend !== "webgpu") return post({ type: "failure", id, failure: classify(error) });
      try {
        await runtime.session.release().catch(() => undefined);
        runtime = await buildRuntime(fileKeys, "wasm");
        post(await run(units, id));
      } catch (fallbackError) {
        post({ type: "failure", id, failure: classify(fallbackError) });
      }
    }
  }

  function dispose(): void {
    void runtime?.session.release().catch(() => undefined);
    runtime = null;
  }

  return (message) => {
    if (message.type === "ping") post({ type: "pong", id: message.id });
    else if (message.type === "initialize") void initialize(message.id, message.keys);
    else if (message.type === "recognize") void recognize(message.id, message.units);
    else if (message.type === "cancel") cancelled.add(message.id);
    else dispose();
  };
}
