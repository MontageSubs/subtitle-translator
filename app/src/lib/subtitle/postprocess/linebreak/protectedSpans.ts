import { MarkedText, pairedSpans } from "./inlineMarkup";

const COUNTER_CHARS = "个個名位年月日号號点點时時分秒岁歲次遍回倍条條件只隻张張块塊元万萬亿億千百层層楼樓米斤度周天场場部辆輛双雙种種套份头頭台页頁集章课課期代世纪紀毛角美刀磅吨噸克升级級人つ円歳番本枚匹階冊杯";
const NUMBER_SUFFIX = `\\s?(?:%|‰|°[CF]?|℃|℉|[€£¥₩])|[${COUNTER_CHARS}]`;
const UNIT_PATTERN = new RegExp(
  [
    "(?:\\p{Script=Latin}\\.){2,}",
    "(?:\\p{Script=Latin}|[0-9]+\\p{Script=Latin})[\\p{Script=Latin}0-9]*(?:['’&-][\\p{Script=Latin}0-9]+)*",
    "[$€£¥₩]\\s?[0-9][0-9.,]*",
    `第?[0-9][0-9.,]*(?:[:·/\\-–][0-9]+)*(?:${NUMBER_SUFFIX})`,
    "[0-9]+(?:[.,:·/\\-–][0-9]+)+",
    "第[0-9]+",
  ].join("|"),
  "gu"
);

const HARD_PATTERNS: readonly RegExp[] = [
  /\.{2,}|[…‥]+/g,
  /[!?！？]{2,}[.…]*/g,
  /[—–-]{2,}|[~～]{2,}/g,
  UNIT_PATTERN,
  /\p{L}+(?:[·•‧]\p{L}+)+/gu,
  /(?:https?:\/\/|www\.)[A-Za-z0-9_\-.~:/?#@!$&'()*+,;=%]+/g,
  /《[^《》]{1,16}》/g,
];

const PAIR_PATTERNS: readonly RegExp[] = [
  /“[^“”]*”|‘[^‘’]*’|「[^「」]*」|『[^『』]*』|《[^《》]*》|（[^（）]*）|【[^【】]*】|„[^„“”]*[“”]|«[^«»]*»|‹[^‹›]*›/g,
  /\([^()]*\)|\[[^\[\]]*\]|"[^"]*"/g,
];

const STYLE_SPAN_PENALTY = 12;
const PAIR_SPAN_PENALTY = 40;
const PAIR_HARD_MAX_CHARS = 8;

export interface Protection {
  forbids(position: number): boolean;
  penaltyAt(position: number): number;
}

type Range = [number, number];

function matchRanges(text: string, patterns: readonly RegExp[]): Range[] {
  return patterns.flatMap((pattern) => Array.from(text.matchAll(pattern), (match): Range => [match.index!, match.index! + match[0].length]));
}

const strictlyInside = (ranges: readonly Range[], position: number): boolean => ranges.some(([start, end]) => start < position && position < end);

export function buildProtection(marked: MarkedText): Protection {
  const { visible } = marked;
  const pairs = matchRanges(visible, PAIR_PATTERNS);
  const hard = [...matchRanges(visible, HARD_PATTERNS), ...pairs.filter(([start, end]) => end - start <= PAIR_HARD_MAX_CHARS)];
  const styled = pairedSpans(marked);
  return {
    forbids: (position) => strictlyInside(hard, position),
    penaltyAt: (position) => (strictlyInside(styled, position) ? STYLE_SPAN_PENALTY : 0) + (strictlyInside(pairs, position) ? PAIR_SPAN_PENALTY : 0),
  };
}
