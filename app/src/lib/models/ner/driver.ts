import { readRecords } from "../records";
import { modelCacheName, modelFileKey } from "../store";
import type { ModelManifest } from "../types";
import type { NerEntity } from "./decode";
import { ModelError } from "../runtime/errors";
import type { NerRequest, NerResponse } from "./protocol";

type RuntimeStatus = "idle" | "initializing" | "ready" | "failed";

type Waiter = { resolve: (message: NerResponse) => void };

interface Channel {
  post(message: NerRequest): void;
  close(): void;
}

let channel: Channel | null = null;
let workerUnavailable = false;
let loadedModelId: string | null = null;
let status: RuntimeStatus = "idle";
let sequence = 0;
const waiters = new Map<number, Waiter>();

const setStatus = (next: RuntimeStatus): void => {
  status = next;
};

function deliver(response: NerResponse): void {
  const waiter = waiters.get(response.id);
  if (!waiter) return;
  waiters.delete(response.id);
  waiter.resolve(response);
}

function openWorkerChannel(): Channel {
  const instance = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  instance.addEventListener("message", (event: MessageEvent<NerResponse>) => deliver(event.data));
  instance.addEventListener("error", () => {
    workerUnavailable = workerUnavailable || status === "initializing";
    waiters.forEach((waiter, id) => waiter.resolve({ type: "failure", id, failure: "load" }));
    waiters.clear();
    if (!workerUnavailable) setStatus("failed");
    disposeNerRuntime();
  });
  return {
    post: (message) => instance.postMessage(message),
    close() {
      try {
        instance.postMessage({ type: "dispose" } satisfies NerRequest);
        instance.terminate();
      } catch {
        workerUnavailable = true;
      }
    },
  };
}

async function openInlineChannel(): Promise<Channel> {
  const { createNerHost } = await import("./host");
  const host = createNerHost((response) => queueMicrotask(() => deliver(response)));
  return { post: (message) => queueMicrotask(() => host(message)), close: () => host({ type: "dispose" }) };
}

function request(message: Extract<NerRequest, { id: number }>): Promise<NerResponse> {
  return new Promise((resolve) => {
    waiters.set(message.id, { resolve });
    channel!.post(message);
  });
}

const IDLE_DISPOSE_MS = 180_000;
let idleTimer: number | undefined;
let initializing: { modelId: string; promise: Promise<void> } | null = null;

function touchRuntime(): void {
  window.clearTimeout(idleTimer);
  idleTimer = window.setTimeout(disposeNerRuntime, IDLE_DISPOSE_MS);
}

export function disposeNerRuntime(): void {
  window.clearTimeout(idleTimer);
  channel?.close();
  channel = null;
  loadedModelId = null;
  if (status !== "failed") setStatus("idle");
}

export function ensureNerRuntime(model: ModelManifest): Promise<void> {
  if (initializing?.modelId === model.id) return initializing.promise;
  const promise = initializeRuntime(model).finally(() => {
    if (initializing?.promise === promise) initializing = null;
  });
  initializing = { modelId: model.id, promise };
  return promise;
}


async function startRuntime(message: Extract<NerRequest, { type: "initialize" }>): Promise<NerResponse> {
  if (!workerUnavailable) {
    try {
      channel = openWorkerChannel();
      const response = await request(message);
      if (!workerUnavailable) return response;
    } catch {
      workerUnavailable = true;
    }
    channel?.close();
  }
  channel = await openInlineChannel();
  return request(message);
}

async function initializeRuntime(model: ModelManifest): Promise<void> {
  const record = readRecords()[model.id];
  if (!record) throw new ModelError("missing");
  if (channel && loadedModelId === model.id && status === "ready") return;
  disposeNerRuntime();
  setStatus("initializing");
  const response = await startRuntime({
    type: "initialize",
    id: ++sequence,
    keys: {
      adapter: model.runtime.adapter,
      providers: model.runtime.providers,
      cacheName: modelCacheName,
      files: Object.fromEntries(Object.entries(model.roles).map(([role, name]) => [role, modelFileKey(model.id, record.version, name)])),
    },
  });
  if (response.type !== "ready") {
    const failure = response.type === "failure" ? response.failure : "load";
    disposeNerRuntime();
    setStatus("failed");
    throw new ModelError(failure);
  }
  loadedModelId = model.id;
  setStatus("ready");
  touchRuntime();
}

export async function recognizeUnits(units: readonly string[], signal: AbortSignal): Promise<NerEntity[][]> {
  if (!channel) throw new ModelError("load");
  const id = ++sequence;
  const abort = (): void => channel?.post({ type: "cancel", id });
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  try {
    touchRuntime();
    const response = await request({ type: "recognize", id, units: [...units] });
    if (response.type !== "result") throw new ModelError(response.type === "failure" ? response.failure : "load");
    return response.entities;
  } finally {
    signal.removeEventListener("abort", abort);
  }
}
