const HEX_RADIX = 16;
const HEX_WIDTH = 2;

export async function sha256Hex(blob: Blob): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()));
  return Array.from(digest, (byte) => byte.toString(HEX_RADIX).padStart(HEX_WIDTH, "0")).join("");
}
