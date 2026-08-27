import { hmacRaw } from "./crypto";

const KEY_CONTEXT = "nmt-challenge";

export async function deriveChallengeKey(secret: string, nonce: number): Promise<Uint8Array> {
  return hmacRaw(secret, `${KEY_CONTEXT}:${nonce}`);
}

async function signWithKey(keyBytes: Uint8Array, message: string): Promise<number> {
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return new DataView(signature).getUint32(0);
}

export function computeAnswer(keyBytes: Uint8Array, nonce: number, text: string, proofCommitment: number): Promise<number> {
  return signWithKey(keyBytes, `${nonce}:${proofCommitment}:${text}`);
}
