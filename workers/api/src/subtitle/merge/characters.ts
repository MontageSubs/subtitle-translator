export const WORD_CHAR_PATTERN = /[\p{L}\p{N}_]/u;
export const WHITESPACE_COLLAPSE_PATTERN = /\s+/g;
export const ELLIPSIS_PATTERN = /\.{2,}|…+/g;
export const NO_LINE_END_CHARS: ReadonlySet<string> = new Set([..."“「『（([{＜〈《【〔„‚«‹¿¡'\"‘"]);
export const NO_LINE_START_CHARS: ReadonlySet<string> = new Set([..."”」』）)]}＞〉》】〕»›、，,。.！!？?；;：:·'\"’"]);
const isDirectionalChar = (char: string): boolean => char !== "'" && char !== '"';
export const CUE_NO_START_CHARS: ReadonlySet<string> = new Set([...[...NO_LINE_START_CHARS].filter(isDirectionalChar), ..."。，、．！？；：）】』」》〉’”·…‥⋯‼⁇⁈⁉〃々〻ーゝゞヽヾ゠・･ぁぃぅぇぉっゃゅょゎゕゖァィゥェォッャュョヮヵヶㇰㇱㇲㇳㇴㇵㇶㇷㇸㇹㇺㇻㇼㇽㇾㇿ〕］｝〗〙〛｣､｡〞〟゛゜〜～％℃℉﹚﹜﹞﹐﹑﹒﹔﹕﹖﹗"]);
export const CUE_NO_END_CHARS: ReadonlySet<string> = new Set([...[...NO_LINE_END_CHARS].filter(isDirectionalChar), ..."（【『「《〈‘“〔〖〘〚［｛｟｢〝＜﹙﹛﹝＄￥￡$€£¥₩₽₹₺₴¢§№"]);

export const hasContent = (text: string): boolean => WORD_CHAR_PATTERN.test(text);

export function isLeadingPunctRun(text: string, matchStart: number): boolean {
  return matchStart > 0 && NO_LINE_END_CHARS.has(text[matchStart - 1]!);
}
