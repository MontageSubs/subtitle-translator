import { base64url, base64urlDecode, bytesToBinary } from "../crypto";

const BLOOM_BITS = 65536;
const BLOOM_BYTES = BLOOM_BITS / 8;
const MASK = BLOOM_BITS - 1;

export interface HashableCue {
  id: number;
  text: string;
}

function bitsFor(text: string): [number, number, number] {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
  const mixed = Math.imul(hash ^ (hash >>> 15), 0x85ebca6b) ^ text.length;
  return [hash & MASK, hash >>> 16, Math.imul(mixed ^ (mixed >>> 13), 0xc2b2ae35) & MASK];
}

export function buildCueBloomFilter(cues: HashableCue[]): string {
  const bytes = new Uint8Array(BLOOM_BYTES);
  for (const cue of cues) {
    const [first, second, third] = bitsFor(cue.text);
    bytes[first >> 3]! |= 1 << (first & 7);
    bytes[second >> 3]! |= 1 << (second & 7);
    bytes[third >> 3]! |= 1 << (third & 7);
  }
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
