import { hmacRaw, sha256Uint32 } from "../crypto";

const KEY_CONTEXT = "nmt-challenge";
const encoder = new TextEncoder();

export const deriveChallengeKey = (secret: string, nonce: number): Promise<Uint8Array> => hmacRaw(secret, `${KEY_CONTEXT}:${nonce}`);

export function computeAnswer(challengeKey: Uint8Array, proofCommitment: number): Promise<number> {
  const commitment = encoder.encode(String(proofCommitment));
  const message = new Uint8Array(challengeKey.length + commitment.length);
  message.set(challengeKey);
  message.set(commitment, challengeKey.length);
  return sha256Uint32(message);
}
