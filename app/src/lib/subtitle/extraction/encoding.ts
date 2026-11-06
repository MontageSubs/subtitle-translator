type NewlineStyle = "crlf" | "cr" | "lf";

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
const LEGACY_MULTIBYTE_ENCODINGS = ["gb18030", "big5", "shift-jis", "euc-kr"];
const LEGACY_SINGLE_BYTE_ENCODING = "windows-1252";
const MIN_CLUSTERED_SHARE = 0.6;
const MIN_NON_ASCII_FOR_DETECTION = 4;
const NON_ASCII_PATTERN = /[^\u0000-\u007f]/g;
const IMPLAUSIBLE_PATTERN = /[\uE000-\uF8FF\u0080-\u009F\uFFFD]/g;
const COMMON_CHARACTERS: Readonly<Record<string, RegExp>> = {
  gb18030: /[的一是不了在人有我他这个们中来上大为和国地到以说时要就出会可也你对生能而子那得于着下自之年过发后作里用道行所然家种事成方多经么]/g,
  big5: /[的一是不了在人有我他這個們中來上大為和國地到以說時要就出會可也你對生能而子那得於著下自之年過發後作裡用道行所然家種事成方多經麼]/g,
  "shift-jis": /[\u3040-\u309f\u30a0-\u30ff]/g,
  "euc-kr": /[이는은가을를에의다요니한하고도지서로아어]/g,
};
const MIN_COMMON_SHARE = 0.1;

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

function clusteredShare(text: string): number {
  let nonAscii = 0;
  let clustered = 0;
  for (let index = 0; index < text.length; index++) {
    if (text.charCodeAt(index) < 0x80) continue;
    nonAscii += 1;
    if ((index > 0 && text.charCodeAt(index - 1) >= 0x80) || (index + 1 < text.length && text.charCodeAt(index + 1) >= 0x80)) clustered += 1;
  }
  return nonAscii === 0 ? 0 : clustered / nonAscii;
}

const countMatches = (text: string, pattern: RegExp): number => text.match(pattern)?.length ?? 0;

function legacyMultibyteScore(text: string, encoding: string): number {
  const nonAscii = countMatches(text, NON_ASCII_PATTERN);
  return countMatches(text, COMMON_CHARACTERS[encoding]) / Math.max(1, nonAscii) - countMatches(text, IMPLAUSIBLE_PATTERN) * 5;
}

function decodeLegacy(bytes: Uint8Array): { text: string; encoding: string } {
  const candidates = LEGACY_MULTIBYTE_ENCODINGS.flatMap((encoding) => {
    const text = tryDecode(bytes, encoding);
    return text !== null && clusteredShare(text) >= MIN_CLUSTERED_SHARE ? [{ text, encoding, score: legacyMultibyteScore(text, encoding) }] : [];
  });
  const best = candidates.reduce<(typeof candidates)[number] | null>((leader, candidate) => (leader === null || candidate.score > leader.score ? candidate : leader), null);
  if (best && best.score >= MIN_COMMON_SHARE && countMatches(best.text, NON_ASCII_PATTERN) >= MIN_NON_ASCII_FOR_DETECTION) return best;
  return { text: new TextDecoder(LEGACY_SINGLE_BYTE_ENCODING).decode(bytes), encoding: LEGACY_SINGLE_BYTE_ENCODING };
}

export function decodeSubtitleBytes(bytes: Uint8Array): { text: string; format: SourceFormat } {
  const marked = BOM_SIGNATURES.find(([, signature]) => matchesBom(bytes, signature));
  if (marked) {
    const [encoding, signature] = marked;
    return describe(decodeMarked(bytes.subarray(signature.length), encoding), encoding, true);
  }
  const unicode = tryDecode(bytes, "utf-8");
  if (unicode !== null) return describe(unicode, "utf-8", false);
  const legacy = decodeLegacy(bytes);
  return describe(legacy.text, legacy.encoding, false);
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
