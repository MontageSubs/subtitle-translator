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
const UTF16_PROBE_BYTES = 2048;
const MIN_UTF16_PROBE_PAIRS = 8;
const UTF16_ZERO_SHARE_MIN = 0.3;
const UTF16_ZERO_SHARE_MAX_OPPOSITE = 0.05;

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

const CARRIAGE_RETURN = 0x0d;
const LINE_FEED = 0x0a;

function detectNewlineStyle(text: string): NewlineStyle {
  let crlf = 0;
  let lf = 0;
  let cr = 0;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (code === LINE_FEED) lf += 1;
    else if (code !== CARRIAGE_RETURN) continue;
    else if (text.charCodeAt(index + 1) === LINE_FEED) {
      crlf += 1;
      index += 1;
    } else cr += 1;
  }
  if (lf >= crlf && lf >= cr) return "lf";
  return crlf >= cr ? "crlf" : "cr";
}

function normalizeToLineFeed(text: string): string {
  return text.includes("\r") ? text.replace(/\r\n?/g, "\n") : text;
}

function applyNewlineStyle(text: string, newline: NewlineStyle): string {
  const normalized = normalizeToLineFeed(text);
  return newline === "lf" ? normalized : normalized.replace(/\n/g, newline === "crlf" ? "\r\n" : "\r");
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

function detectBomlessUtf16(bytes: Uint8Array): "utf-16le" | "utf-16be" | null {
  const pairs = Math.min(bytes.length, UTF16_PROBE_BYTES) >> 1;
  if (pairs < MIN_UTF16_PROBE_PAIRS) return null;
  let zerosAtEven = 0;
  let zerosAtOdd = 0;
  for (let pair = 0; pair < pairs; pair++) {
    if (bytes[pair * 2] === 0) zerosAtEven += 1;
    if (bytes[pair * 2 + 1] === 0) zerosAtOdd += 1;
  }
  const even = zerosAtEven / pairs;
  const odd = zerosAtOdd / pairs;
  if (odd >= UTF16_ZERO_SHARE_MIN && even <= UTF16_ZERO_SHARE_MAX_OPPOSITE) return "utf-16le";
  if (even >= UTF16_ZERO_SHARE_MIN && odd <= UTF16_ZERO_SHARE_MAX_OPPOSITE) return "utf-16be";
  return null;
}

export function decodeSubtitleBytes(bytes: Uint8Array): { text: string; format: SourceFormat } {
  const marked = BOM_SIGNATURES.find(([, signature]) => matchesBom(bytes, signature));
  if (marked) {
    const [encoding, signature] = marked;
    return describe(decodeMarked(bytes.subarray(signature.length), encoding), encoding, true);
  }
  const utf16 = detectBomlessUtf16(bytes);
  const utf16Text = utf16 === null ? null : tryDecode(bytes.subarray(0, bytes.length - (bytes.length % 2)), utf16);
  if (utf16 !== null && utf16Text !== null) return describe(utf16Text, utf16, false);
  const unicode = tryDecode(bytes, "utf-8");
  if (unicode !== null) return describe(unicode, "utf-8", false);
  const legacy = decodeLegacy(bytes);
  return describe(legacy.text, legacy.encoding, false);
}

const HOST_IS_LITTLE_ENDIAN = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;

const encodeUtf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

function encodeUtf16(text: string, littleEndian: boolean): Uint8Array {
  const units = new Uint16Array(text.length);
  for (let index = 0; index < text.length; index++) units[index] = text.charCodeAt(index);
  const bytes = new Uint8Array(units.buffer);
  if (littleEndian === HOST_IS_LITTLE_ENDIAN) return bytes;
  for (let index = 0; index < bytes.length; index += 2) {
    const first = bytes[index]!;
    bytes[index] = bytes[index + 1]!;
    bytes[index + 1] = first;
  }
  return bytes;
}

const ENCODERS: Readonly<Record<string, (text: string) => Uint8Array>> = {
  "utf-8": encodeUtf8,
  "utf-16le": (text) => encodeUtf16(text, true),
  "utf-16be": (text) => encodeUtf16(text, false),
};

export function encodeSubtitleText(text: string, format: SourceFormat): Uint8Array {
  const encode = ENCODERS[format.encoding];
  if (!encode) return encodeUtf8(applyNewlineStyle(text, "lf"));
  const body = encode(applyNewlineStyle(text, format.newline));
  const bom = format.bom ? UNICODE_BOMS[format.encoding] : undefined;
  if (!bom) return body;
  const output = new Uint8Array(bom.length + body.length);
  output.set(bom);
  output.set(body, bom.length);
  return output;
}
