const toHex = (digest: ArrayBuffer): string => Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");

export async function sha256Hex(data: Blob | Uint8Array): Promise<string> {
  const bytes = data instanceof Blob ? await data.arrayBuffer() : data;
  return toHex(await crypto.subtle.digest("SHA-256", bytes as BufferSource));
}
