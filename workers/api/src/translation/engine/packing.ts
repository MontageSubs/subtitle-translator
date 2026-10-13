import { charLength } from "./text";

const MAX_PAYLOADS_PER_REQUEST = 50;

export function packByChars(payloads: readonly string[], maxChars: number): number[][] {
  const chunks: number[][] = [];
  let current: number[] = [];
  let chars = 0;
  payloads.forEach((payload, index) => {
    const length = charLength(payload);
    if (current.length > 0 && (chars + length > maxChars || current.length >= MAX_PAYLOADS_PER_REQUEST)) {
      chunks.push(current);
      current = [];
      chars = 0;
    }
    current.push(index);
    chars += length;
  });
  if (current.length > 0) chunks.push(current);
  return chunks;
}
