export class TransferError extends Error {
  constructor(readonly failure: "network" | "unavailable") {
    super(failure);
  }
}

export interface PartialTransfer {
  pieces: Blob[];
  received: number;
  total: number | null;
}

export const newTransfer = (): PartialTransfer => ({ pieces: [], received: 0, total: null });

export async function fetchResumable(url: string, transfer: PartialTransfer, signal: AbortSignal, onBytes: (bytes: number) => void): Promise<Blob> {
  const resuming = transfer.received > 0;
  const response = await fetch(url, { headers: resuming ? { Range: `bytes=${transfer.received}-` } : {}, signal }).catch(() => {
    throw new TransferError("network");
  });
  if (response.status === 404) throw new TransferError("unavailable");
  if (!response.ok || !response.body) throw new TransferError("network");
  if (resuming && response.status !== 206) {
    onBytes(-transfer.received);
    Object.assign(transfer, newTransfer());
  }
  const length = Number(response.headers.get("Content-Length"));
  if (Number.isFinite(length) && length > 0) transfer.total = transfer.received + length;
  let buffered: Uint8Array[] = [];
  const flush = (): void => {
    if (!buffered.length) return;
    transfer.pieces.push(new Blob(buffered as BlobPart[]));
    buffered = [];
  };
  const reader = response.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffered.push(value);
      transfer.received += value.byteLength;
      onBytes(value.byteLength);
    }
  } catch (error) {
    flush();
    if (signal.aborted) throw error;
    throw new TransferError("network");
  }
  flush();
  if (transfer.total !== null && transfer.received !== transfer.total) throw new TransferError("network");
  return new Blob(transfer.pieces);
}
