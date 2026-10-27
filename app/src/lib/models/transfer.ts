export class TransferError extends Error {
  constructor(readonly failure: "network" | "unavailable", readonly detail: string | null = null) {
    super(failure);
  }
}

export interface PartialTransfer {
  pieces: Blob[];
  received: number;
  total: number | null;
}

const FLUSH_BYTES = 4 * 1024 * 1024;
const MAX_AUTOMATIC_RETRIES = 4;
const RETRY_BASE_DELAY_MS = 1500;
const STATUS_NOT_FOUND = 404;
const STATUS_PARTIAL_CONTENT = 206;

export const newTransfer = (): PartialTransfer => ({ pieces: [], received: 0, total: null });

const describeError = (error: unknown): string => (error instanceof Error ? `${error.name}: ${error.message}` : String(error));

function restart(transfer: PartialTransfer, onBytes: (bytes: number) => void): void {
  onBytes(-transfer.received);
  Object.assign(transfer, newTransfer());
}

async function openStream(url: string, transfer: PartialTransfer, signal: AbortSignal, onBytes: (bytes: number) => void): Promise<Response> {
  const resuming = transfer.received > 0;
  try {
    return await fetch(url, { headers: resuming ? { Range: `bytes=${transfer.received}-` } : {}, signal });
  } catch (error) {
    if (signal.aborted) throw error;
    if (!resuming) throw new TransferError("network", describeError(error));
    restart(transfer, onBytes);
    return fetch(url, { signal }).catch((retryError: unknown) => {
      if (signal.aborted) throw retryError;
      throw new TransferError("network", describeError(retryError));
    });
  }
}

export async function fetchResumable(url: string, transfer: PartialTransfer, signal: AbortSignal, onBytes: (bytes: number) => void): Promise<Blob> {
  const response = await openStream(url, transfer, signal, onBytes);
  if (response.status === STATUS_NOT_FOUND) throw new TransferError("unavailable", `HTTP ${response.status}`);
  if (!response.ok || !response.body) throw new TransferError("network", `HTTP ${response.status}`);
  if (transfer.received > 0 && response.status !== STATUS_PARTIAL_CONTENT) restart(transfer, onBytes);
  const length = Number(response.headers.get("Content-Length"));
  if (Number.isFinite(length) && length > 0) transfer.total = transfer.received + length;
  let buffered: Uint8Array[] = [];
  let bufferedBytes = 0;
  const flush = (): void => {
    if (!buffered.length) return;
    transfer.pieces.push(new Blob(buffered as BlobPart[]));
    buffered = [];
    bufferedBytes = 0;
  };
  const reader = response.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffered.push(value);
      bufferedBytes += value.byteLength;
      transfer.received += value.byteLength;
      onBytes(value.byteLength);
      if (bufferedBytes >= FLUSH_BYTES) flush();
    }
  } catch (error) {
    flush();
    if (signal.aborted) throw error;
    throw new TransferError("network", describeError(error));
  }
  flush();
  if (transfer.total !== null && transfer.received !== transfer.total) throw new TransferError("network", `${transfer.received}/${transfer.total}`);
  return new Blob(transfer.pieces);
}

function pause(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(resolve, milliseconds);
    signal.addEventListener("abort", () => {
      window.clearTimeout(timer);
      reject(signal.reason);
    }, { once: true });
  });
}

export async function fetchWithRetry(url: string, transfer: PartialTransfer, signal: AbortSignal, onBytes: (bytes: number) => void): Promise<Blob> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetchResumable(url, transfer, signal, onBytes);
    } catch (error) {
      if (signal.aborted || !(error instanceof TransferError) || error.failure !== "network" || attempt >= MAX_AUTOMATIC_RETRIES) throw error;
      await pause(RETRY_BASE_DELAY_MS * 2 ** attempt, signal);
    }
  }
}
