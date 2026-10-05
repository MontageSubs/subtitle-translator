export type NewlineStyle = "crlf" | "cr" | "lf";

export interface SourceFormat {
  encoding: string;
  bom: boolean;
  newline: NewlineStyle;
}

const BOM_SIGNATURES: [string, number[]][] = [
  ["utf-32le", [0xff, 0xfe, 0x00, 0x00]],
  ["utf-32be", [0x00, 0x00, 0xfe, 0xff]],
  ["utf-8", [0xef, 0xbb, 0xbf]],
  ["utf-16le", [0xff, 0xfe]],
  ["utf-16be", [0xfe, 0xff]],
];

const UNICODE_BOMS: Record<string, number[]> = Object.fromEntries(BOM_SIGNATURES);
const MAX_CODE_POINT = 0x10ffff;
const REPLACEMENT_CHARACTER = "\uFFFD";
const FALLBACK_ENCODINGS = ["windows-1252", "gb18030", "big5", "shift-jis", "euc-kr", "iso-8859-1"];

function matchesBom(bytes: Uint8Array, signature: number[]): boolean {
  return signature.length <= bytes.length && signature.every((byte, index) => bytes[index] === byte);
}

function tryDecode(bytes: Uint8Array, encoding: string): string | null {
  try {
    return new TextDecoder(encoding, { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function detectNewlineStyle(text: string): NewlineStyle {
  if (text.includes("\r\n")) return "crlf";
  return text.includes("\r") ? "cr" : "lf";
}

function applyNewlineStyle(text: string, newline: NewlineStyle): string {
  if (newline === "lf") return text;
  return text.replace(/\n/g, newline === "crlf" ? "\r\n" : "\r");
}

function describe(text: string, encoding: string, bom: boolean): { text: string; format: SourceFormat } {
  return { text, format: { encoding, bom, newline: detectNewlineStyle(text) } };
}

function decodeUtf32(bytes: Uint8Array, littleEndian: boolean): string {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength - (bytes.byteLength % 4));
  const characters: string[] = [];
  for (let offset = 0; offset < view.byteLength; offset += 4) {
    const codePoint = view.getUint32(offset, littleEndian);
    characters.push(codePoint <= MAX_CODE_POINT ? String.fromCodePoint(codePoint) : REPLACEMENT_CHARACTER);
  }
  return characters.join("");
}

function decodeMarked(bytes: Uint8Array, encoding: string): string {
  if (encoding === "utf-32le" || encoding === "utf-32be") return decodeUtf32(bytes, encoding === "utf-32le");
  return new TextDecoder(encoding).decode(bytes);
}

export function decodeSubtitleBytes(bytes: Uint8Array): { text: string; format: SourceFormat } {
  const marked = BOM_SIGNATURES.find(([, signature]) => matchesBom(bytes, signature));
  if (marked) {
    const [encoding, signature] = marked;
    return describe(decodeMarked(bytes.subarray(signature.length), encoding), encoding, true);
  }
  for (const encoding of ["utf-8", ...FALLBACK_ENCODINGS]) {
    const text = tryDecode(bytes, encoding);
    if (text !== null) return describe(text, encoding, false);
  }
  return describe(new TextDecoder("utf-8", { fatal: false }).decode(bytes), "utf-8", false);
}

function encodeUtf16(text: string, littleEndian: boolean): Uint8Array {
  const view = new DataView(new ArrayBuffer(text.length * 2));
  for (let index = 0; index < text.length; index++) view.setUint16(index * 2, text.charCodeAt(index), littleEndian);
  return new Uint8Array(view.buffer);
}

function encodeBody(text: string, encoding: string): Uint8Array {
  switch (encoding) {
    case "utf-8": return new TextEncoder().encode(text);
    case "utf-16le": return encodeUtf16(text, true);
    case "utf-16be": return encodeUtf16(text, false);
    default: throw new Error(`encoding back to ${encoding} is not supported, use utf-8`);
  }
}

export function encodeSubtitleText(text: string, format: SourceFormat): Uint8Array {
  const normalized = applyNewlineStyle(text, format.newline);
  try {
    const body = encodeBody(normalized, format.encoding);
    if (!format.bom) return body;
    const bom = UNICODE_BOMS[format.encoding];
    return Uint8Array.from([...bom, ...body]);
  } catch {
    return new TextEncoder().encode(normalized);
  }
}
