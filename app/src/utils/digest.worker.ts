import { sha256 } from "@noble/hashes/sha2.js";

const toHex = (digest: Uint8Array): string => Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");

self.onmessage = async (event: MessageEvent<{ id: number; blob: Blob }>): Promise<void> => {
  const { id, blob } = event.data;
  try {
    const hash = sha256.create();
    const reader = blob.stream().getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      hash.update(value);
    }
    self.postMessage({ id, hex: toHex(hash.digest()) });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
