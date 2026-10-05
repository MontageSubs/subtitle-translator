import { defineChineseLanguage } from "../families/chinese";
import { createOrthographyRule } from "../shared/orthography";

export const yue = defineChineseLanguage("yue", createOrthographyRule(
  [
    "喺", "喺度", "由", "向", "畀", "同", "將", "自", "跟", "到", "由得", "為咗", "趁", "照", "順",
    "呢", "呢個", "呢啲", "嗰", "嗰個", "嗰啲", "邊個", "邊度", "點解", "關於", "同埋"
  ],
  [
    "嘅", "咗", "緊", "過", "喇", "咩", "呢", "咪", "呀", "喎", "㗎", "啫", "囉", "哩", "晒", "埋",
    "掂", "倒", "翻", "返", "添", "咋", "嘞", "啩", "啝", "先", "定", "哋"
  ],
  [
    "而且", "但係", "不過", "或者", "所以", "如果", "同埋", "抑或", "因為", "既然", "縱使", "雖然", "就算", "只要"
  ]
));
