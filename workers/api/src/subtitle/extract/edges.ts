const BLANK = 1;
const TERMINAL = 2;
const CONTINUATION = 4;
const NOTE = 8;
const CLOSER = 16;
const QUOTE = 32;
const BRACKET_OPEN = 64;
const BRACKET_CLOSE = 128;

const BMP_SIZE = 0x10000;
const KINDS = new Uint8Array(BMP_SIZE);

const mark = (chars: string, kind: number): void => {
  for (const char of chars) KINDS[char.charCodeAt(0)]! |= kind;
};

mark("\t\n\v\f\r \u00a0\u1680\u2028\u2029\u202f\u205f\u3000\ufeff", BLANK);
for (let code = 0x2000; code <= 0x200a; code++) KINDS[code]! |= BLANK;
mark(".!?\u2026\u22ef\u3002\uff01\uff1f\u203c\u2047\u2048\u2049\u061f\u06d4\u0964\u0965\u0589\u037e\u104b\u1362", TERMINAL);
mark(",;:\u3001\uff0c\uff1b\uff1a", CONTINUATION);
mark("\u266a\u266b\u2669\u266c*\u2020\u2021\u203b\u2605\u2606", NOTE);
mark(")]}\uff09\uff3d\uff5d\u3015\u3017\u3019\u301b\u3009\u300b\u3011\u27e9\u27eb\uff1e\u201d\u2019\u00bb\u203a\u300d\u300f\u301e\u301f", CLOSER);
mark("\"'", QUOTE);
mark("([{\uff08\uff3b\uff5b\u3014\u3016\u3018\u301a\u3008\u300a\u3010\u27e8\u27ea", BRACKET_OPEN);
mark(")]}\uff09\uff3d\uff5d\u3015\u3017\u3019\u301b\u3009\u300b\u3011\u27e9\u27eb", BRACKET_CLOSE);

export const TAIL_TERMINAL = 1;
export const TAIL_ELLIPSIS = 2;
export const TAIL_CONTINUATION = 4;
export const TAIL_DASH = 8;
export const TAIL_CLOSED = 16;
export const TAIL_END_SHIFT = 8;

export const HEAD_ELLIPSIS = 1;
export const HEAD_LOWER = 2;
export const HEAD_UPPER = 4;
export const HEAD_CLOSER = 8;

export interface CueEdges {
  text: string;
  tail: number;
  head: number;
}

const LETTER_PATTERN = /\p{L}/u;
const LOWER_PATTERN = /\p{Ll}/u;
const UPPER_PATTERN = /[\p{Lu}\p{Lt}]/u;
const NOT_LETTER = 1;
const LOWER_LETTER = 2;
const UPPER_LETTER = 3;
const UNCASED_LETTER = 4;
const letterMemo = new Uint8Array(BMP_SIZE);

function classifyLetter(char: string): number {
  if (LOWER_PATTERN.test(char)) return LOWER_LETTER;
  if (UPPER_PATTERN.test(char)) return UPPER_LETTER;
  return LETTER_PATTERN.test(char) ? UNCASED_LETTER : NOT_LETTER;
}

function letterClassOf(code: number): number {
  let known = letterMemo[code]!;
  if (!known) letterMemo[code] = known = classifyLetter(String.fromCharCode(code));
  return known;
}

const isStyleLetter = (code: number): boolean => (code | 32) === 105 || (code | 32) === 98 || (code | 32) === 117;

function styleTagLength(text: string, index: number): number {
  if (text.charCodeAt(index) !== 60) return 0;
  if (isStyleLetter(text.charCodeAt(index + 1)) && text.charCodeAt(index + 2) === 62) return 3;
  return text.charCodeAt(index + 1) === 47 && isStyleLetter(text.charCodeAt(index + 2)) && text.charCodeAt(index + 3) === 62 ? 4 : 0;
}

export function skipLeading(text: string): number {
  let index = 0;
  while (index < text.length) {
    if (KINDS[text.charCodeAt(index)]! & (BLANK | NOTE)) index++;
    else {
      const tag = styleTagLength(text, index);
      if (!tag) break;
      index += tag;
    }
  }
  return index;
}

export function classifyTail(text: string): number {
  let content = text.length;
  let closed = false;
  while (content > 0) {
    const code = text.charCodeAt(content - 1);
    const kind = KINDS[code]!;
    if (kind & (BLANK | NOTE)) content--;
    else if (kind & (CLOSER | QUOTE)) {
      closed = true;
      content--;
    } else if (code === 62 && content >= 4 && styleTagLength(text, content - 4) === 4) content -= 4;
    else break;
  }
  const last = text.charCodeAt(content - 1);
  const previous = text.charCodeAt(content - 2);
  let flags = 0;
  if (last === 0x2026 || last === 0x22ef) flags = TAIL_ELLIPSIS;
  else if (last === 46) flags = previous === 46 ? TAIL_ELLIPSIS : TAIL_TERMINAL;
  else if (last === 45) flags = previous === 45 ? TAIL_TERMINAL : TAIL_DASH;
  else if (KINDS[last]! & TERMINAL) flags = TAIL_TERMINAL;
  else if (KINDS[last]! & CONTINUATION) flags = TAIL_CONTINUATION;
  return (closed ? flags | TAIL_CLOSED : flags) | (content << TAIL_END_SHIFT);
}

export function classifyHead(text: string): number {
  let index = skipLeading(text);
  let flags = 0;
  let lead = index;
  while (KINDS[text.charCodeAt(lead)]! & QUOTE) lead++;
  const first = text.charCodeAt(lead);
  if (first === 0x2026 || (first === 46 && text.charCodeAt(lead + 1) === 46)) flags = HEAD_ELLIPSIS;
  else if (KINDS[first]! & CLOSER) flags = HEAD_CLOSER;
  for (; index < text.length; index++) {
    const code = text.charCodeAt(index);
    const tag = styleTagLength(text, index);
    if (tag) {
      index += tag - 1;
      continue;
    }
    const letter = code >= 0xd800 && code <= 0xdbff ? classifyLetter(String.fromCodePoint(text.codePointAt(index)!)) : letterClassOf(code);
    if (letter === NOT_LETTER) continue;
    if (letter === LOWER_LETTER) flags |= HEAD_LOWER;
    else if (letter === UPPER_LETTER) flags |= HEAD_UPPER;
    break;
  }
  return flags;
}

export const isBlank = (code: number): boolean => (KINDS[code]! & BLANK) !== 0;
export const isBracketOpen = (code: number): boolean => (KINDS[code]! & BRACKET_OPEN) !== 0;
export const isBracketClose = (code: number): boolean => (KINDS[code]! & BRACKET_CLOSE) !== 0;
