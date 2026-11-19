import { TransferError } from "../../net/transferError";
import { workersFunctional } from "../../../utils/workerProbe";
import { fetchFromMirrors, newTransfer, type PartialTransfer } from "../transfer";
import type { DownloadCommand, DownloadEvent } from "./downloadProtocol";

export interface DownloadSession {
  received(): Promise<number>;
  retrieve(file: string, urls: readonly string[], signal: AbortSignal, onBytes: (delta: number) => void): Promise<Blob>;
  discard(): void;
}

interface PendingRequest {
  onBytes: (delta: number) => void;
  settle: (event: DownloadEvent) => void;
}

const WORKER_FAILED_DETAIL = "download worker failed";
const WORKER_ACKNOWLEDGE_MS = 2000;
const WORKER_SILENCE_MS = 6000;

let worker: Worker | null = null;
let workerDistrusted = false;
let nextRequest = 0;
const pending = new Map<number, PendingRequest>();

function failAll(): void {
  pending.forEach((request, id) => request.settle({ kind: "failed", request: id, aborted: false, failure: "network", detail: WORKER_FAILED_DETAIL }));
  pending.clear();
  worker?.terminate();
  worker = null;
}

function distrustWorker(): void {
  workerDistrusted = true;
  failAll();
}

function downloadWorker(): Worker | null {
  if (worker) return worker;
  if (workerDistrusted || typeof Worker === "undefined") return null;
  try {
    const created = new Worker(new URL("./downloadWorker.ts", import.meta.url), { type: "module" });
    created.onmessage = (message: MessageEvent<DownloadEvent>): void => {
      const event = message.data;
      const request = pending.get(event.request);
      if (!request) return;
      if (event.kind === "bytes") return request.onBytes(event.delta);
      pending.delete(event.request);
      request.settle(event);
    };
    created.onerror = failAll;
    worker = created;
    return created;
  } catch {
    return null;
  }
}

const abortError = (): DOMException => new DOMException("Aborted", "AbortError");

const within = <T>(promise: Promise<T>, milliseconds: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("worker did not respond")), milliseconds);
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });

function request<T>(command: DownloadCommand & { request: number }, onBytes: (delta: number) => void, signal: AbortSignal | null, accept: (event: DownloadEvent) => T): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const host = downloadWorker();
    if (!host) return reject(new TransferError("network", WORKER_FAILED_DETAIL));
    const abort = (): void => {
      host.postMessage({ kind: "abort", request: command.request } satisfies DownloadCommand);
      if (pending.delete(command.request)) reject(abortError());
    };
    pending.set(command.request, {
      onBytes,
      settle: (event) => {
        signal?.removeEventListener("abort", abort);
        if (event.kind === "failed") return reject(event.aborted ? abortError() : new TransferError(event.failure, event.detail));
        resolve(accept(event));
      },
    });
    if (signal?.aborted) return abort();
    signal?.addEventListener("abort", abort, { once: true });
    host.postMessage(command);
  });
}

function workerSession(job: string): DownloadSession {
  return {
    received: () => request({ kind: "received", request: nextRequest++, job }, () => undefined, null, (event) => (event.kind === "received" ? event.value : 0)),
    retrieve: (file, urls, signal, onBytes) => request({ kind: "fetch", request: nextRequest++, job, file, urls }, onBytes, signal, (event) => (event.kind === "done" ? event.blob : new Blob())),
    discard: () => worker?.postMessage({ kind: "discard", job } satisfies DownloadCommand),
  };
}

function inlineSession(): DownloadSession {
  const transfers = new Map<string, PartialTransfer>();
  return {
    received: async () => [...transfers.values()].reduce((sum, transfer) => sum + transfer.received, 0),
    retrieve: (file, urls, signal, onBytes) => {
      const transfer = transfers.get(file) ?? newTransfer();
      transfers.set(file, transfer);
      return fetchFromMirrors(urls, transfer, signal, onBytes);
    },
    discard: () => transfers.clear(),
  };
}

async function retrieveViaWorker(remote: DownloadSession, inline: DownloadSession, file: string, urls: readonly string[], signal: AbortSignal, onBytes: (delta: number) => void): Promise<Blob> {
  const attempt = new AbortController();
  const relay = (): void => attempt.abort();
  signal.addEventListener("abort", relay, { once: true });
  let delivered = 0;
  let silenced = false;
  const timer = setTimeout(() => {
    if (delivered > 0) return;
    silenced = true;
    attempt.abort();
  }, WORKER_SILENCE_MS);
  try {
    return await remote.retrieve(file, urls, attempt.signal, (delta) => {
      delivered += delta;
      onBytes(delta);
    });
  } catch (error) {
    const workerFault = silenced || (error instanceof TransferError && error.detail === WORKER_FAILED_DETAIL);
    if (signal.aborted || !workerFault) throw error;
    distrustWorker();
    if (delivered) onBytes(-delivered);
    return inline.retrieve(file, urls, signal, onBytes);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", relay);
  }
}

export function openDownloadSession(job: string): DownloadSession {
  const inline = inlineSession();
  const remote = workerSession(job);
  const worksInWorker = async (): Promise<boolean> => !workerDistrusted && (await workersFunctional()) && downloadWorker() !== null;
  return {
    received: async () => {
      if (!(await worksInWorker())) return inline.received();
      return within(remote.received(), WORKER_ACKNOWLEDGE_MS).catch(() => {
        distrustWorker();
        return inline.received();
      });
    },
    retrieve: async (file, urls, signal, onBytes) => ((await worksInWorker()) ? retrieveViaWorker(remote, inline, file, urls, signal, onBytes) : inline.retrieve(file, urls, signal, onBytes)),
    discard: () => {
      remote.discard();
      inline.discard();
    },
  };
}
