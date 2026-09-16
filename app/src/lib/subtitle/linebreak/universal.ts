const CJK_NO_START = "。，、！？；：）】』」》〉’”·…‥っゃゅょゎッャュョヮーヵヶヽヾゝゞ々〕］｝〗〙〛﹚﹜﹞";
const CJK_NO_END = "（【『「《〈‘“〔〖〘〚﹙﹛﹝";
const SYMBOLS_NO_END = "$€£¥₩₽₹₺₴¢§№";

export const UNIVERSAL_NO_START = new Set(`.,;:!?)]}%‰’”»›°ºª′″/${CJK_NO_START}`);
export const UNIVERSAL_NO_END = new Set(`([{«‹“‘¿¡„‚${CJK_NO_END}${SYMBOLS_NO_END}`);

