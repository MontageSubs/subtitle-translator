import { defineKoreanLanguage } from "../families/korean";
import { createOrthographyRule } from "../shared/orthography";

export const ko = defineKoreanLanguage("ko", createOrthographyRule(
  [
    "그", "이", "저", "몇", "온", "모든", "어떤", "각", "새", "헌", "옛", "첫", "단", "무슨", "어느"
  ],
  [
    "은", "는", "이", "가", "을", "를", "에", "에서", "로", "으로", "와", "과", "도", "만", "의",
    "에게", "한테", "보다", "처럼", "마저", "조차", "부터", "까지", "커녕", "치고", "마냥", "이라도", "라도"
  ],
  [
    "그리고", "그러나", "하지만", "또는", "그런데", "따라서", "그러므로", "그래도", "그러면", "아니면", "왜냐하면"
  ]
));
