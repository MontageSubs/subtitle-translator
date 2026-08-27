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

const FALLBACK_ENCODINGS = ["windows-1252", "gb18030", "big5", "shift-jis", "euc-kr", "iso-8859-1"];

function matchesBom(bytes: Uint8Array, signature: number[]): boolean {
  return signature.length <= bytes.length && signature.every((byte, i) => bytes[i] === byte);
}

function tryDecode(bytes: Uint8Array, encoding: string): string | null {
  try {
    return new TextDecoder(encoding, { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

export function detectNewlineStyle(text: string): NewlineStyle {
  if (text.includes("\r\n")) return "crlf";
  if (text.includes("\r")) return "cr";
  return "lf";
}

export function applyNewlineStyle(text: string, newline: NewlineStyle): string {
  if (newline === "crlf") return text.replace(/\n/g, "\r\n");
  if (newline === "cr") return text.replace(/\n/g, "\r");
  return text;
}

export function decodeSubtitleBytes(bytes: Uint8Array): { text: string; format: SourceFormat } {
  for (const [encoding, signature] of BOM_SIGNATURES) {
    if (matchesBom(bytes, signature)) {
      const text = new TextDecoder(encoding).decode(bytes.subarray(signature.length));
      return { text, format: { encoding, bom: true, newline: detectNewlineStyle(text) } };
    }
  }

  const strictUtf8 = tryDecode(bytes, "utf-8");
  if (strictUtf8 !== null) {
    return { text: strictUtf8, format: { encoding: "utf-8", bom: false, newline: detectNewlineStyle(strictUtf8) } };
  }

  for (const encoding of FALLBACK_ENCODINGS) {
    const decoded = tryDecode(bytes, encoding);
    if (decoded !== null) {
      return { text: decoded, format: { encoding, bom: false, newline: detectNewlineStyle(decoded) } };
    }
  }

  const lossy = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  return { text: lossy, format: { encoding: "utf-8", bom: false, newline: detectNewlineStyle(lossy) } };
}

export function encodeSubtitleText(text: string, format: SourceFormat): Uint8Array {
  const withNewline = applyNewlineStyle(text, format.newline);
  try {
    const encoder = format.encoding === "utf-8" ? new TextEncoder() : null;
    const body = encoder ? encoder.encode(withNewline) : encodeLegacy(withNewline, format.encoding);
    if (!format.bom) return body;
    if (format.encoding === "utf-8") return concatBytes([0xef, 0xbb, 0xbf], body);
    if (format.encoding === "utf-16le") return concatBytes([0xff, 0xfe], body);
    if (format.encoding === "utf-16be") return concatBytes([0xfe, 0xff], body);
    return body;
  } catch {
    return new TextEncoder().encode(withNewline);
  }
}

function concatBytes(prefix: number[], body: Uint8Array): Uint8Array {
  const out = new Uint8Array(prefix.length + body.length);
  out.set(prefix, 0);
  out.set(body, prefix.length);
  return out;
}

function encodeLegacy(text: string, encoding: string): Uint8Array {
  if (encoding === "utf-16le" || encoding === "utf-16be") {
    const units = new Uint16Array(text.length);
    for (let i = 0; i < text.length; i++) units[i] = text.charCodeAt(i);
    const bytes = new Uint8Array(units.buffer.slice(0));
    if (encoding === "utf-16be") for (let i = 0; i < bytes.length; i += 2) [bytes[i], bytes[i + 1]] = [bytes[i + 1], bytes[i]];
    return bytes;
  }
  throw new Error(`encoding back to ${encoding} is not supported, use utf-8`);
}
