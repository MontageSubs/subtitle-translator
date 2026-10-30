import type { ChineseOrthography } from "../../common/chineseOrthography";
import { createCjkContinuation, type ContinuationRule } from "./cjk";

const INTERJECTIVE_OR_LEXICAL_ENCLITICS = new Set(["呢", "啊", "哇", "哈", "哎", "耶", "呀", "哟", "喲", "过", "過", "得", "地", "罢", "罷", "等等", "先", "定", "咪", "咩", "倒", "翻", "返", "掂"]);
const STANDALONE_PROCLITICS = new Set(["对", "對", "给", "給", "借", "藉", "按", "这", "這", "这个", "這個", "这些", "這些", "那", "那个", "那個", "那些", "哪", "每", "各", "各个", "呢", "呢個", "呢啲", "嗰", "嗰個", "嗰啲", "邊個", "邊度", "點解"]);
const SENTENCE_STARTS = ["嗯", "啊", "哦", "喔", "噢", "喂", "哎", "唉", "嘿", "呃", "哈", "哇", "哟", "咦", "谢谢", "謝謝", "对不起", "對不起", "你好", "再见", "再見", "好的", "好吧"];
const CONTINUATION_STARTS = ["但是", "但係", "可是", "而且", "并且", "並且", "所以", "因此", "然后", "然後", "而是", "于是", "於是", "以及", "或者", "但", "而", "并", "並", "却", "卻"];
const EXTRA_ENCLITICS = ["嘛", "么", "麼", "而已", "罢了", "罷了", "似的"];
const EXTRA_END_WORDS = ["然后", "然後", "不过", "不過", "可是", "而是", "以便", "由于", "由於", "除了", "通过", "通過", "随着", "隨著", "除非", "的话", "的話", "之后", "之後", "之前"];
const END_PHRASES = ["的时候", "的時候"];

export function createChineseContinuation(...orthographies: readonly ChineseOrthography[]): ContinuationRule {
  return createCjkContinuation({
    locale: "zh",
    noCueStart: [...orthographies.flatMap(({ enclitics }) => enclitics).filter((word) => !INTERJECTIVE_OR_LEXICAL_ENCLITICS.has(word)), ...EXTRA_ENCLITICS],
    noCueEnd: [...orthographies.flatMap(({ proclitics, conjunctions }) => [...proclitics.filter((word) => !STANDALONE_PROCLITICS.has(word)), ...conjunctions]), ...EXTRA_END_WORDS],
    noCueEndPhrases: END_PHRASES,
    completeEndings: [],
    sentenceStarts: SENTENCE_STARTS,
    continuationStarts: CONTINUATION_STARTS,
    turnStarts: "（(【[-－―",
  });
}
