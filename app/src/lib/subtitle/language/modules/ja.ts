import { defineJapaneseLanguage } from "../families/japanese";
import { createOrthographyRule } from "../shared/orthography";

export const ja = defineJapaneseLanguage("ja", createOrthographyRule(
  [
    "お", "ご", "御", "貴", "諸", "各", "毎", "元", "前", "新", "超", "最", "大", "小",
    "この", "その", "あの", "どの"
  ],
  [
    "は", "が", "を", "に", "へ", "と", "から", "より", "で", "や", "の", "ね", "よ", "か",
    "わ", "ぞ", "ぜ", "な", "も", "ば", "て", "でも", "たり", "だけ", "ほど", "ばかり", "さえ",
    "こそ", "など", "なら", "かしら", "って", "ちゃ", "じゃ"
  ],
  [
    "そして", "しかし", "また", "または", "だが", "したがって", "だから", "あるいは", "つまり", "ところで",
    "なお", "けれども", "けれど"
  ]
));
