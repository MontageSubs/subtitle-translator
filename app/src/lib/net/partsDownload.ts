import { isPartsDescriptor, type PartDescriptor, type PartsDescriptor } from "../../config/assetLayout";
import { abortableDelay } from "../../utils/abortableDelay";
import { sha256Hex } from "../../utils/digest";
import { createStreamGovernor } from "./adaptiveStreams";
import { TransferError } from "./transferError";

export interface PartsState {
  descriptor: PartsDescriptor | null;
  completed: Map<number, Blob>;
}

export interface PartsOptions {
  maxStreams?: number;
  fixedStreams?: number;
  headerTimeoutMs?: number;
  onCompleted?: (completedBytes: number, totalBytes: number) => void;
}

export const newPartsState = (): PartsState => ({ descriptor: null, completed: new Map() });

const DEFAULT_MAX_STREAMS = 8;
const DEFAULT_HEADER_TIMEOUT_MS = 20_000;
const ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 1_000;
const FLUSH_BYTES = 4 * 1024 * 1024;
const STATUS_NOT_FOUND = 404;

const describeError = (error: unknown): string => (error instanceof Error ? `${error.name}: ${error.message}` : String(error));

async function withAttempts<T>(operation: () => Promise<T>, signal: AbortSignal, onRetry: () => void = () => undefined): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (signal.aborted || !(error instanceof TransferError) || error.failure !== "network" || attempt >= ATTEMPTS) throw error;
      onRetry();
      await abortableDelay(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1), signal);
    }
  }
}

async function openResponse(url: string, signal: AbortSignal, headerTimeoutMs: number): Promise<{ response: Response; release: () => void }> {
  const controller = new AbortController();
  const relay = (): void => controller.abort(signal.reason);
  if (signal.aborted) throw signal.reason;
  signal.addEventListener("abort", relay, { once: true });
  const release = (): void => signal.removeEventListener("abort", relay);
  const timer = setTimeout(() => controller.abort(new DOMException("No response", "TimeoutError")), headerTimeoutMs);
  try {
    const response = await fetch(url, { credentials: "omit", redirect: "follow", signal: controller.signal });
    return { response, release };
  } catch (error) {
    release();
    if (signal.aborted) throw error;
    throw new TransferError("network", describeError(error));
  } finally {
    clearTimeout(timer);
  }
}

async function fetchDescriptor(url: string, signal: AbortSignal, headerTimeoutMs: number): Promise<PartsDescriptor> {
  const { response, release } = await openResponse(url, signal, headerTimeoutMs);
  try {
    if (response.status === STATUS_NOT_FOUND) throw new TransferError("unavailable", "HTTP 404");
    if (!response.ok) throw new TransferError("network", `HTTP ${response.status}`);
    const value: unknown = await response.json().catch(() => null);
    if (!isPartsDescriptor(value)) throw new TransferError("unavailable", "invalid descriptor");
    return value;
  } finally {
    release();
  }
}

async function downloadPart(url: string, part: PartDescriptor, signal: AbortSignal, onBytes: (bytes: number) => void, headerTimeoutMs: number): Promise<Blob> {
  const { response, release } = await openResponse(url, signal, headerTimeoutMs);
  let received = 0;
  try {
    if (response.status === STATUS_NOT_FOUND) throw new TransferError("unavailable", `HTTP 404 ${part.path}`);
    if (!response.ok || !response.body) throw new TransferError("network", `HTTP ${response.status}`);
    const pieces: Blob[] = [];
    let buffered: Uint8Array[] = [];
    let bufferedBytes = 0;
    const flush = (): void => {
      if (!buffered.length) return;
      pieces.push(new Blob(buffered as BlobPart[]));
      buffered = [];
      bufferedBytes = 0;
    };
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read().catch((error: unknown) => {
        if (signal.aborted) throw error;
        throw new TransferError("network", describeError(error));
      });
      if (done) break;
      buffered.push(value);
      bufferedBytes += value.byteLength;
      received += value.byteLength;
      onBytes(value.byteLength);
      if (bufferedBytes >= FLUSH_BYTES) flush();
    }
    flush();
    if (received !== part.bytes) throw new TransferError("network", `${part.path} ${received}/${part.bytes}`);
    const blob = new Blob(pieces);
    if ((await sha256Hex(blob)) !== part.sha256) throw new TransferError("network", `${part.path} checksum`);
    return blob;
  } catch (error) {
    onBytes(-received);
    throw error;
  } finally {
    release();
  }
}

export async function fetchParts(descriptorUrl: string, state: PartsState, signal: AbortSignal, onBytes: (bytes: number) => void, options: PartsOptions = {}): Promise<Blob> {
  const headerTimeoutMs = options.headerTimeoutMs ?? DEFAULT_HEADER_TIMEOUT_MS;
  state.descriptor ??= await withAttempts(() => fetchDescriptor(descriptorUrl, signal, headerTimeoutMs), signal);
  const { descriptor } = state;
  const base = new URL(descriptorUrl);
  const urls = descriptor.parts.map((part) => new URL(part.path, base));
  if (urls.some(({ origin }) => origin !== base.origin)) throw new TransferError("unavailable", "part outside the descriptor origin");
  const completedBytes = (): number => [...state.completed.keys()].reduce((sum, index) => sum + descriptor.parts[index]!.bytes, 0);
  options.onCompleted?.(completedBytes(), descriptor.bytes);

  const queue = descriptor.parts.flatMap((_, index) => (state.completed.has(index) ? [] : [index]));
  const internal = new AbortController();
  const relay = (): void => internal.abort(signal.reason);
  if (signal.aborted) throw signal.reason;
  signal.addEventListener("abort", relay, { once: true });
  const governor = createStreamGovernor({ maxStreams: options.maxStreams ?? DEFAULT_MAX_STREAMS, fixedStreams: options.fixedStreams });
  const waiting: Array<() => void> = [];
  const wakeAll = (): void => waiting.splice(0).forEach((resume) => resume());
  governor.onChange(wakeAll);
  const countBytes = (bytes: number): void => {
    governor.record(bytes);
    onBytes(bytes);
  };
  let active = 0;
  let failure: unknown;

  const work = async (): Promise<void> => {
    while (failure === undefined && queue.length) {
      if (active >= governor.limit()) {
        await new Promise<void>((resume) => waiting.push(resume));
        continue;
      }
      const index = queue.shift()!;
      active += 1;
      try {
        const blob = await withAttempts(() => downloadPart(urls[index]!.href, descriptor.parts[index]!, internal.signal, countBytes, headerTimeoutMs), internal.signal, governor.reportFailure);
        state.completed.set(index, blob);
        options.onCompleted?.(completedBytes(), descriptor.bytes);
      } catch (error) {
        failure ??= error;
        internal.abort(error);
      } finally {
        active -= 1;
        wakeAll();
      }
    }
    wakeAll();
  };

  governor.start();
  try {
    await Promise.all(Array.from({ length: Math.min(options.maxStreams ?? DEFAULT_MAX_STREAMS, queue.length) }, work));
  } finally {
    governor.dispose();
    signal.removeEventListener("abort", relay);
  }
  if (signal.aborted) throw signal.reason;
  if (failure !== undefined) throw failure;
  return new Blob(descriptor.parts.map((_, index) => state.completed.get(index)!));
}
