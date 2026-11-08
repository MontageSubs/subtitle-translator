import { TransferError } from "../../net/transferError";
import { fetchFromMirrors, newTransfer, type PartialTransfer } from "../transfer";
import type { DownloadCommand, DownloadEvent } from "./downloadProtocol";

const PROGRESS_INTERVAL_MS = 100;

const jobs = new Map<string, Map<string, PartialTransfer>>();
const controllers = new Map<number, AbortController>();

const emit = (event: DownloadEvent): void => self.postMessage(event);

async function runFetch(request: number, job: string, file: string, urls: readonly string[]): Promise<void> {
  const controller = new AbortController();
  controllers.set(request, controller);
  const session = jobs.get(job) ?? new Map<string, PartialTransfer>();
  jobs.set(job, session);
  const transfer = session.get(file) ?? newTransfer();
  session.set(file, transfer);
  let pendingDelta = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = (): void => {
    clearTimeout(timer);
    timer = undefined;
    if (!pendingDelta) return;
    emit({ kind: "bytes", request, delta: pendingDelta });
    pendingDelta = 0;
  };
  const onBytes = (delta: number): void => {
    pendingDelta += delta;
    timer ??= setTimeout(flush, PROGRESS_INTERVAL_MS);
  };
  try {
    const blob = await fetchFromMirrors(urls, transfer, controller.signal, onBytes);
    flush();
    emit({ kind: "done", request, blob });
  } catch (error) {
    flush();
    const failure = error instanceof TransferError ? error : new TransferError("network", error instanceof Error ? error.message : String(error));
    emit({ kind: "failed", request, aborted: controller.signal.aborted, failure: failure.failure, detail: failure.detail });
  } finally {
    controllers.delete(request);
  }
}

self.onmessage = (event: MessageEvent<DownloadCommand>): void => {
  const command = event.data;
  switch (command.kind) {
    case "fetch": void runFetch(command.request, command.job, command.file, command.urls); break;
    case "abort": controllers.get(command.request)?.abort(); break;
    case "received": emit({ kind: "received", request: command.request, value: [...(jobs.get(command.job)?.values() ?? [])].reduce((sum, transfer) => sum + transfer.received, 0) }); break;
    case "discard": jobs.delete(command.job); break;
  }
};
