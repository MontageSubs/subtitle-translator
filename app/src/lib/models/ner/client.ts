import { readRecords } from "../records";
import { modelCacheName, modelFileKey } from "../store";
import type { ModelManifest } from "../types";
import type { NerEntity } from "./decode";
import type { NerFailure, NerRequest, NerResponse } from "./protocol";

export class NerError extends Error {
  constructor(readonly failure: NerFailure | "missing") {
    super(failure);
  }
}

export type NerRuntimeStatus = "idle" | "initializing" | "ready" | "failed";

type Waiter = { resolve: (message: NerResponse) => void; onProgress?: (done: number, total: number) => void };

let worker: Worker | null = null;
let loadedModelId: string | null = null;
let status: NerRuntimeStatus = "idle";
let sequence = 0;
const waiters = new Map<number, Waiter>();
const statusListeners = new Set<() => void>();

const setStatus = (next: NerRuntimeStatus): void => {
  status = next;
  statusListeners.forEach((listener) => listener());
};

export const nerRuntimeStatus = (): NerRuntimeStatus => status;

export function subscribeNerRuntime(listener: () => void): () => void {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

function spawn(): Worker {
  const instance = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  instance.addEventListener("message", (event: MessageEvent<NerResponse>) => {
    const waiter = waiters.get(event.data.id);
    if (!waiter) return;
    if (event.data.type === "progress") return waiter.onProgress?.(event.data.done, event.data.total);
    waiters.delete(event.data.id);
    waiter.resolve(event.data);
  });
  instance.addEventListener("error", () => {
    waiters.forEach((waiter, id) => waiter.resolve({ type: "failure", id, failure: "load" }));
    waiters.clear();
    disposeNerRuntime();
    setStatus("failed");
  });
  return instance;
}

function request(message: Extract<NerRequest, { id: number }>, onProgress?: Waiter["onProgress"]): Promise<NerResponse> {
  return new Promise((resolve) => {
    waiters.set(message.id, { resolve, onProgress });
    worker!.postMessage(message);
  });
}

export function disposeNerRuntime(): void {
  worker?.postMessage({ type: "dispose" } satisfies NerRequest);
  worker?.terminate();
  worker = null;
  loadedModelId = null;
  if (status !== "failed") setStatus("idle");
}

export async function ensureNerRuntime(model: ModelManifest): Promise<void> {
  const record = readRecords()[model.id];
  if (!record) throw new NerError("missing");
  if (worker && loadedModelId === model.id && status === "ready") return;
  disposeNerRuntime();
  setStatus("initializing");
  worker = spawn();
  const id = ++sequence;
  const response = await request({
    type: "initialize",
    id,
    keys: {
      cacheName: modelCacheName,
      model: modelFileKey(model.id, record.version, model.roles.model),
      config: modelFileKey(model.id, record.version, model.roles.config),
      vocabulary: modelFileKey(model.id, record.version, model.roles.vocabulary),
    },
  });
  if (response.type !== "ready") {
    const failure = response.type === "failure" ? response.failure : "load";
    disposeNerRuntime();
    setStatus("failed");
    throw new NerError(failure);
  }
  loadedModelId = model.id;
  setStatus("ready");
}

export async function recognizeEntities(chunks: string[], signal: AbortSignal, onProgress: (done: number, total: number) => void): Promise<NerEntity[][]> {
  if (!worker) throw new NerError("load");
  const id = ++sequence;
  const abort = (): void => worker?.postMessage({ type: "cancel", id } satisfies NerRequest);
  signal.addEventListener("abort", abort, { once: true });
  try {
    const response = await request({ type: "recognize", id, chunks }, onProgress);
    if (response.type === "result") return response.entities;
    throw new NerError(response.type === "failure" ? response.failure : "load");
  } finally {
    signal.removeEventListener("abort", abort);
  }
}
