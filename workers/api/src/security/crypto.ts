import { BoundedMap } from "../support/boundedMap";
import { getOrInsert } from "../support/getOrInsert";

const MAX_CACHED_KEYS = 128;
const BASE64_CHUNK = 0x8000;
const encoder = new TextEncoder();
const HEX = Array.from({ length: 256 }, (_, byte) => byte.toString(16).padStart(2, "0"));
const hmacKeys = new BoundedMap<string, Promise<CryptoKey>>(MAX_CACHED_KEYS);

const hmacKey = (secret: string): Promise<CryptoKey> =>
  getOrInsert(hmacKeys, secret, () => crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]));

export async function hmacHex(secret: string, message: string): Promise<string> {
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(message)));
  let hex = "";
  for (let i = 0; i < signature.length; i++) hex += HEX[signature[i]!];
  return hex;
}

export async function sha256Uint32(data: BufferSource): Promise<number> {
  return new DataView(await crypto.subtle.digest("SHA-256", data)).getUint32(0);
}

export function bytesToBinary(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK) {
    binary += Reflect.apply(String.fromCharCode, undefined, bytes.subarray(offset, offset + BASE64_CHUNK));
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
