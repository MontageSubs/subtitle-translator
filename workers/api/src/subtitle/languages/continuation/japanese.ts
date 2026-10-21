import { createCjkContinuation } from "./cjk";

export const continuesJapaneseSentence = createCjkContinuation({
  clauseLinks: ["ながら", "つつ", "ので", "ために", "ための", "として", "について", "という", "ような", "によって", "による", "たり", "だり", "ずに", "ないで", "くせに", "途端", "とたん", "ものの", "うちに"],
  openEndings: ["を", "へ", "まで", "より", "ば"],
  sentenceStarts: ["ええ", "えっ", "あっ", "ああ", "あ", "いや", "うん", "はい", "おい", "ほら", "まあ", "さあ", "ねえ", "なあ", "もう", "でも", "だから", "じゃあ", "じゃ", "それで", "そして", "しかし", "だが", "だけど", "ところで", "つまり", "えーと", "うーん", "ちょっと", "すみません", "ありがとう"],
  continuationStarts: [],
  turnStarts: "（(【[-－―",
});
