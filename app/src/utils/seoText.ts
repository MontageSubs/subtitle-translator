export const TITLE_WIDTH = 60;
export const DESCRIPTION_WIDTH = 155;

const ELLIPSIS = "…";
const MIN_FILL_RATIO = 0.6;
const WIDE_CHARACTER = /[\u1100-\u115f\u2e80-\u9fff\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6]/;
const SENTENCE_END = /[。！？]|[.!?](?=\s|$)/g;
const CLAUSE_BREAK = /[\s,;:，、；：]/g;
const WORD_CHARACTER = /[\p{L}\p{N}]/u;
const WIDE_WORD_CHARACTER = /[\u2e80-\u9fff\uac00-\ud7a3]/;
const TRAILING_SEPARATORS = /[\s,.;:，。；：、]+$/;

const widthOf = (character: string): number => (WIDE_CHARACTER.test(character) ? 2 : 1);

export const textWidth = (text: string): number => [...text].reduce((width, character) => width + widthOf(character), 0);

function indexWithin(text: string, maxWidth: number): number {
  let width = 0;
  let index = 0;
  for (const character of text) {
    width += widthOf(character);
    if (width > maxWidth) break;
    index += character.length;
  }
  return index;
}

function lastBoundaryEnd(text: string, pattern: RegExp, minIndex: number): number {
  let end = 0;
  for (const match of text.matchAll(pattern)) {
    const next = match.index + match[0].length;
    if (next >= minIndex) end = next;
  }
  return end;
}

const splitsLatinWord = (text: string, index: number): boolean => {
  const before = text[index - 1] ?? "";
  const after = text[index] ?? "";
  return WORD_CHARACTER.test(before) && WORD_CHARACTER.test(after) && !WIDE_WORD_CHARACTER.test(before) && !WIDE_WORD_CHARACTER.test(after);
};

export function fitText(source: string, maxWidth: number, preferSentenceEnd = false): string {
  const text = source.replace(/\s+/g, " ").trim();
  if (textWidth(text) <= maxWidth) return text;
  const limit = indexWithin(text, maxWidth - textWidth(ELLIPSIS));
  const head = text.slice(0, limit);
  const minIndex = indexWithin(text, maxWidth * MIN_FILL_RATIO);
  const sentenceEnd = preferSentenceEnd ? lastBoundaryEnd(head, SENTENCE_END, minIndex) : 0;
  if (sentenceEnd > 0) return head.slice(0, sentenceEnd).trim();
  const clauseEnd = lastBoundaryEnd(head, CLAUSE_BREAK, minIndex);
  let cut = clauseEnd > 0 ? clauseEnd - 1 : limit;
  while (cut > minIndex && splitsLatinWord(text, cut)) cut -= 1;
  return `${text.slice(0, cut).replace(TRAILING_SEPARATORS, "")}${ELLIPSIS}`;
}
