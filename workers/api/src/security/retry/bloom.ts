import { base64url, base64urlDecode, bytesToBinary } from "../crypto";

const BLOOM_BITS = 65536;
const BLOOM_BYTES = BLOOM_BITS / 8;
const MASK = BLOOM_BITS - 1;

export interface HashableCue {
  id: number;
  text: string;
}

function fnv1aPair(text: string): [number, number] {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 0x01000193);
    h2 = Math.imul(h2 ^ code, 0x85ebca6b);
  }
  return [h1 >>> 0, h2 >>> 0];
}

function bitsFor(text: string): [number, number, number] {
  const [h1, h2] = fnv1aPair(text);
  return [h1 & MASK, (h1 + h2) & MASK, (h1 + 2 * h2) & MASK];
}

export function buildCueBloomFilter(cues: HashableCue[]): string {
  const bytes = new Uint8Array(BLOOM_BYTES);
  for (const cue of cues) for (const bit of bitsFor(cue.text)) bytes[bit >> 3]! |= 1 << (bit & 7);
  return base64url(bytesToBinary(bytes));
}

export function verifyCuesInBloomFilter(cues: HashableCue[], encodedFilter: string): boolean {
  if (!encodedFilter || cues.length === 0) return false;
  let binary: string;
  try {
    binary = base64urlDecode(encodedFilter);
  } catch {
    return false;
  }
  if (binary.length !== BLOOM_BYTES) return false;
  return cues.every((cue) => bitsFor(cue.text).every((bit) => binary.charCodeAt(bit >> 3) & (1 << (bit & 7))));
}
