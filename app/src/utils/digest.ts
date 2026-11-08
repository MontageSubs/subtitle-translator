const STREAMING_THRESHOLD_BYTES = 4 * 1024 * 1024;

const toHex = (digest: ArrayBuffer): string => Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");

interface DigestReply {
  id: number;
  hex?: string;
  error?: string;
}

let worker: Worker | null = null;
let nextRequestId = 0;
const pending = new Map<number, { resolve: (hex: string) => void; reject: (error: Error) => void }>();

function digestWorker(): Worker {
  if (worker) return worker;
  const created = new Worker(new URL("./digest.worker.ts", import.meta.url), { type: "module" });
  created.onmessage = (event: MessageEvent<DigestReply>): void => {
    const { id, hex, error } = event.data;
    const request = pending.get(id);
    pending.delete(id);
    if (hex !== undefined) request?.resolve(hex);
    else request?.reject(new Error(error ?? "digest failed"));
  };
  created.onerror = (): void => {
    pending.forEach((request) => request.reject(new Error("digest worker failed")));
    pending.clear();
    created.terminate();
    worker = null;
  };
  worker = created;
  return created;
}

const streamedSha256Hex = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const id = nextRequestId++;
    pending.set(id, { resolve, reject });
    digestWorker().postMessage({ id, blob });
  });

async function wholeSha256Hex(data: Blob | Uint8Array): Promise<string> {
  const bytes = data instanceof Blob ? await data.arrayBuffer() : data;
  return toHex(await crypto.subtle.digest("SHA-256", bytes as BufferSource));
}

export async function sha256Hex(data: Blob | Uint8Array): Promise<string> {
  if (!(data instanceof Blob) || data.size < STREAMING_THRESHOLD_BYTES || typeof Worker === "undefined" || typeof document === "undefined") return wholeSha256Hex(data);
  return streamedSha256Hex(data).catch(() => wholeSha256Hex(data));
}
