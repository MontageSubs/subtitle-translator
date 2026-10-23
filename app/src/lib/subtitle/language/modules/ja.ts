import { defineJapaneseLanguage } from "../families/japanese";
import { JAPANESE_NO_CUE_START } from "../../common/japaneseOrthography";
import { createOrthographyRule } from "../shared/orthography";
import { japaneseSdh } from "../sdh/ja";

export const ja = defineJapaneseLanguage("ja", createOrthographyRule(
  [
    "お", "ご", "御", "貴", "諸", "各", "毎", "元", "前", "新", "超", "最", "大", "小",
    "この", "その", "あの", "どの"
  ],
  [
    ...new Set([
      "は", "が", "を", "に", "へ", "と", "から", "より", "で", "や", "の", "ね", "よ", "か",
      "わ", "ぞ", "ぜ", "な", "も", "ば", "て", "でも", "たり", "だけ", "ほど", "ばかり", "さえ",
      "こそ", "など", "なら", "かしら", "って", "ちゃ", "じゃ", ...JAPANESE_NO_CUE_START
    ])
  ],
  [
    "そして", "しかし", "また", "または", "だが", "したがって", "だから", "あるいは", "つまり", "ところで",
    "なお", "けれども", "けれど"
  ]
), japaneseSdh);
