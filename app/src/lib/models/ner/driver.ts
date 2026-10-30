import { readRecords } from "../records";
import { modelCacheName, modelFileKey } from "../store";
import type { ModelManifest } from "../types";
import type { NerEntity } from "./decode";
import type { NerBackend } from "./inference";
import { untilAborted } from "../runtime/abortable";
import { ModelError } from "../runtime/errors";
import { ChannelError, createRequestChannel, type RequestChannel } from "../runtime/requestChannel";
import type { NerFileKeys, NerRequest, NerResponse } from "./protocol";

type NerChannel = RequestChannel<NerRequest, NerResponse>;

interface ActiveRuntime {
  channel: NerChannel;
  modelId: string;
  backend: NerBackend;
}

const HANDSHAKE_DEADLINE_MS = 10_000;
const INITIALIZE_DEADLINE_MS = 60_000;
const RECOGNIZE_DEADLINE_MS = 120_000;
const IDLE_DISPOSE_MS = 300_000;

let active: ActiveRuntime | null = null;
let initializing: { modelId: string; promise: Promise<void> } | null = null;
let workerBlocked = false;
let generation = 0;
let sequence = 0;
let idleTimer: number | undefined;

function openWorkerChannel(): NerChannel {
  return createRequestChannel<NerRequest, NerResponse>((deliver, fail) => {
    const instance = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    instance.addEventListener("message", (event: MessageEvent<NerResponse>) => deliver(event.data));
    instance.addEventListener("error", fail);
    instance.addEventListener("messageerror", fail);
    return {
      post: (message) => instance.postMessage(message),
      close() {
        try {
          instance.postMessage({ type: "dispose" } satisfies NerRequest);
        } finally {
          instance.terminate();
        }
      },
    };
  });
}

async function openInlineChannel(): Promise<NerChannel> {
  const { createNerHost } = await import("./host");
  return createRequestChannel<NerRequest, NerResponse>((deliver) => {
    const host = createNerHost((response) => queueMicrotask(() => deliver(response)));
    return { post: (message) => queueMicrotask(() => host(message)), close: () => host({ type: "dispose" }) };
  });
}

async function openVerifiedWorkerChannel(): Promise<NerChannel | null> {
  let channel: NerChannel | null = null;
  try {
    channel = openWorkerChannel();
    await channel.request({ type: "ping", id: ++sequence }, HANDSHAKE_DEADLINE_MS);
    return channel;
  } catch {
    channel?.close();
    workerBlocked = true;
    return null;
  }
}

function toModelError(error: unknown): ModelError {
  if (error instanceof ModelError) return error;
  if (error instanceof ChannelError) return new ModelError(error.reason === "closed" ? "aborted" : "load", error);
  return new ModelError("load", error);
}

async function initializeChannel(channel: NerChannel, keys: NerFileKeys): Promise<NerBackend> {
  const response = await channel.request({ type: "initialize", id: ++sequence, keys }, INITIALIZE_DEADLINE_MS).catch((error: unknown) => {
    throw toModelError(error);
  });
  if (response.type !== "ready") throw new ModelError(response.type === "failure" ? response.failure : "load");
  return response.backend;
}

async function connect(keys: NerFileKeys): Promise<{ channel: NerChannel; backend: NerBackend }> {
  if (!workerBlocked) {
    const worker = await openVerifiedWorkerChannel();
    if (worker) {
      try {
        return { channel: worker, backend: await initializeChannel(worker, keys) };
      } catch (error) {
        worker.close();
        if (toModelError(error).code !== "load") throw error;
        workerBlocked = true;
      }
    }
  }
  const inline = await openInlineChannel();
  try {
    return { channel: inline, backend: await initializeChannel(inline, keys) };
  } catch (error) {
    inline.close();
    throw error;
  }
}

function keysFor(model: ModelManifest, version: string): NerFileKeys {
  return {
    adapter: model.runtime.adapter,
    providers: model.runtime.providers,
    cacheName: modelCacheName,
    files: Object.fromEntries(Object.entries(model.roles).map(([role, name]) => [role, modelFileKey(model.id, version, name)])),
  };
}

function touchRuntime(): void {
  window.clearTimeout(idleTimer);
  idleTimer = window.setTimeout(disposeNerRuntime, IDLE_DISPOSE_MS);
}

export function disposeNerRuntime(): void {
  window.clearTimeout(idleTimer);
  generation += 1;
  initializing = null;
  active?.channel.close();
  active = null;
}

async function initializeRuntime(model: ModelManifest): Promise<void> {
  const record = readRecords()[model.id];
  if (!record) throw new ModelError("missing");
  if (active?.modelId === model.id && active.channel.alive) return touchRuntime();
  disposeNerRuntime();
  const token = generation;
  const { channel, backend } = await connect(keysFor(model, record.version));
  if (token !== generation) {
    channel.close();
    throw new ModelError("aborted");
  }
  active = { channel, modelId: model.id, backend };
  touchRuntime();
}

export function ensureNerRuntime(model: ModelManifest): Promise<void> {
  if (initializing?.modelId === model.id) return initializing.promise;
  const promise = initializeRuntime(model).finally(() => {
    if (initializing?.promise === promise) initializing = null;
  });
  initializing = { modelId: model.id, promise };
  return promise;
}

export async function recognizeUnits(units: readonly string[], signal: AbortSignal): Promise<NerEntity[][]> {
  const runtime = active;
  if (!runtime?.channel.alive) throw new ModelError("load");
  const id = ++sequence;
  const cancel = (): void => {
    runtime.channel.forget(id);
    runtime.channel.notify({ type: "cancel", id });
  };
  signal.addEventListener("abort", cancel, { once: true });
  touchRuntime();
  try {
    const response = await untilAborted(runtime.channel.request({ type: "recognize", id, units: [...units] }, RECOGNIZE_DEADLINE_MS), signal);
    if (response.type !== "result") throw new ModelError(response.type === "failure" ? response.failure : "load");
    return response.entities;
  } catch (error) {
    if (!signal.aborted && error instanceof ChannelError && error.reason !== "closed" && active === runtime) disposeNerRuntime();
    throw signal.aborted ? error : toModelError(error);
  } finally {
    signal.removeEventListener("abort", cancel);
  }
}

export const activeNerBackend = (): NerBackend | null => active?.backend ?? null;
