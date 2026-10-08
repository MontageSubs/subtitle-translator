const encoder = new TextEncoder();
const HEX = Array.from({ length: 256 }, (_, byte) => byte.toString(16).padStart(2, "0"));
const BASE64_CHUNK = 0x8000;
const keyCache = new Map<string, Promise<CryptoKey>>();

function importHmacKey(raw: BufferSource): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

function hmacKey(secret: string): Promise<CryptoKey> {
  let key = keyCache.get(secret);
  if (!key) keyCache.set(secret, (key = importHmacKey(encoder.encode(secret))));
  return key;
}

export async function hmacRaw(secret: string, message: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(message)));
}

export function toHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) hex += HEX[bytes[i]!];
  return hex;
}

export async function hmacHex(secret: string, message: string): Promise<string> {
  return toHex(await hmacRaw(secret, message));
}

export async function sha256Uint32(data: BufferSource): Promise<number> {
  return new DataView(await crypto.subtle.digest("SHA-256", data)).getUint32(0);
}

export function bytesToBinary(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + BASE64_CHUNK));
  }
  return binary;
}

export const base64url = (binary: string): string => btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export const base64urlDecode = (encoded: string): string => atob(encoded.replace(/-/g, "+").replace(/_/g, "/"));

export const encodeJson = (value: unknown): string => base64url(JSON.stringify(value));

export function decodeJson<T>(encoded: string): T | null {
  try {
    return JSON.parse(base64urlDecode(encoded)) as T;
  } catch {
    return null;
  }
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
