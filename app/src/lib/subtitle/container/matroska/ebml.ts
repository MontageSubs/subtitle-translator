export const UNKNOWN_SIZE = -1;

export const MAX_ELEMENT_HEADER_BYTES = 12;

export interface ElementHeader {
  id: number;
  size: number;
  headerLength: number;
}

export interface Vint {
  value: number;
  length: number;
  allOnes: boolean;
}

const MAX_ID_LENGTH = 4;
const MAX_VINT_LENGTH = 8;
const BYTE_RANGE = 256;

const leadingZeroBits = (byte: number): number => Math.clz32(byte) - 24;

export function readVint(bytes: Uint8Array, offset: number): Vint | null {
  const first = bytes[offset];
  if (first === undefined || first === 0) return null;
  const length = leadingZeroBits(first) + 1;
  if (length > MAX_VINT_LENGTH || offset + length > bytes.length) return null;
  const markerMask = 0xff >> length;
  let value = first & markerMask;
  let allOnes = value === markerMask;
  for (let index = 1; index < length; index++) {
    const byte = bytes[offset + index];
    value = value * BYTE_RANGE + byte;
    if (byte !== 0xff) allOnes = false;
  }
  return { value, length, allOnes };
}

export function readElementHeader(bytes: Uint8Array, offset: number): ElementHeader | null {
  const first = bytes[offset];
  if (first === undefined || first === 0) return null;
  const idLength = leadingZeroBits(first) + 1;
  if (idLength > MAX_ID_LENGTH || offset + idLength > bytes.length) return null;
  let id = 0;
  for (let index = 0; index < idLength; index++) id = id * BYTE_RANGE + bytes[offset + index];
  const size = readVint(bytes, offset + idLength);
  if (!size) return null;
  return { id, size: size.allOnes ? UNKNOWN_SIZE : size.value, headerLength: idLength + size.length };
}

export function readUnsigned(bytes: Uint8Array): number {
  let value = 0;
  for (const byte of bytes) value = value * BYTE_RANGE + byte;
  return value;
}

export function readSigned16(bytes: Uint8Array, offset: number): number {
  const value = (bytes[offset] << 8) | bytes[offset + 1];
  return value >= 0x8000 ? value - 0x10000 : value;
}

export function bytesEqual(left: Uint8Array, right: readonly number[]): boolean {
  return left.length === right.length && right.every((byte, index) => left[index] === byte);
}

export function* childElements(body: Uint8Array): Generator<{ id: number; start: number; end: number }> {
  let offset = 0;
  while (offset < body.length) {
    const header = readElementHeader(body, offset);
    if (!header || header.size === UNKNOWN_SIZE) return;
    const start = offset + header.headerLength;
    const end = Math.min(body.length, start + header.size);
    yield { id: header.id, start, end };
    offset = end;
  }
}
