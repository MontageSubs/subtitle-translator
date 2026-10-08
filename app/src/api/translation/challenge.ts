import { digestUint32 } from "../../utils/clientCheck";
import { decodeBase64Url } from "./tokens";

const encoder = new TextEncoder();

export function computeAnswer(challengeKey: string, proofCommitment: number): Promise<number> {
  const key = decodeBase64Url(challengeKey);
  const commitment = encoder.encode(String(proofCommitment));
  const message = new Uint8Array(key.length + commitment.length);
  message.set(key);
  message.set(commitment, key.length);
  return digestUint32(message);
}
