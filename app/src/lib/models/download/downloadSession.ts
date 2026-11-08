import { TransferError } from "../../net/transferError";
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

let worker: Worker | null = null;
let nextRequest = 0;
const pending = new Map<number, PendingRequest>();

function failAll(): void {
  pending.forEach((request, id) => request.settle({ kind: "failed", request: id, aborted: false, failure: "network", detail: "download worker failed" }));
  pending.clear();
  worker?.terminate();
  worker = null;
}

function downloadWorker(): Worker | null {
  if (worker) return worker;
  if (typeof Worker === "undefined") return null;
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

function request<T>(command: DownloadCommand & { request: number }, onBytes: (delta: number) => void, signal: AbortSignal | null, accept: (event: DownloadEvent) => T): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const host = downloadWorker();
    if (!host) return reject(new TransferError("network", "download worker unavailable"));
    const abort = (): void => host.postMessage({ kind: "abort", request: command.request } satisfies DownloadCommand);
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
    discard: () => downloadWorker()?.postMessage({ kind: "discard", job } satisfies DownloadCommand),
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

export function openDownloadSession(job: string): DownloadSession {
  return downloadWorker() ? workerSession(job) : inlineSession();
}
