import { OrthographyRule } from "./types";

const CJK_NO_START = "。，、！？；：）】』」》〉’”·…‥っゃゅょゎッャュョヮーヵヶヽヾゝゞ々〕］｝〗〙〛﹚﹜﹞";
const CJK_NO_END = "（【『「《〈‘“〔〖〘〚﹙﹛﹝";
const SYMBOLS_NO_END = "$€£¥₩₽₹₺₴¢§№";

const UNIVERSAL_NO_START = new Set(`.,;:!?)]}%‰’”»›°ºª′″/${CJK_NO_START}`);
const UNIVERSAL_NO_END = new Set(`([{«‹“‘¿¡„‚${CJK_NO_END}${SYMBOLS_NO_END}`);

export function createOrthographyRule(proclitics: readonly string[] = [], enclitics: readonly string[] = [], conjunctions: readonly string[] = []): OrthographyRule {
  return {
    noLineStart: UNIVERSAL_NO_START,
    noLineEnd: UNIVERSAL_NO_END,
    proclitics: new Set(proclitics),
    enclitics: new Set(enclitics),
    conjunctions: new Set(conjunctions),
  };
}

export const UNIVERSAL_ORTHOGRAPHY: OrthographyRule = createOrthographyRule();
