import { JAPANESE_NO_CUE_END, JAPANESE_NO_CUE_END_PHRASES, JAPANESE_NO_CUE_START } from "../../common/japaneseOrthography";
import { createCjkContinuation } from "./cjk";

export const continuesJapaneseSentence = createCjkContinuation({
  locale: "ja",
  noCueStart: JAPANESE_NO_CUE_START,
  noCueEnd: JAPANESE_NO_CUE_END,
  noCueEndPhrases: JAPANESE_NO_CUE_END_PHRASES,
  completeEndings: ["こんにちは", "こんばんは", "どうも", "これまで", "今まで", "ここまで", "そこまで", "どこまで", "あそこまで", "っと", "ちゃんと", "ほんと", "ふと"],
  sentenceStarts: ["ええ", "えっ", "あっ", "ああ", "あ", "いや", "うん", "はい", "おい", "ほら", "まあ", "さあ", "ねえ", "なあ", "もう", "でも", "だから", "じゃあ", "じゃ", "それで", "そして", "しかし", "だが", "だけど", "ところで", "つまり", "えーと", "うーん", "ちょっと", "すみません", "ありがとう"],
  continuationStarts: [],
  turnStarts: "（(【[-－―",
});
