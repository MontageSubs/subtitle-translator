const SIMPLIFIED_ONLY = "们这个说为学对时会从来点与发当么过还经国问没关开东车见长门间电话买卖听书写读认让请应该进现实头样种体声";
const TRADITIONAL_ONLY = "們這個說為學對時會從來點與發當麼過還經國問沒關開東車見長門間電話買賣聽書寫讀認讓請應該進現實頭樣種體聲";
const MIN_EVIDENCE = 8;
const DOMINANCE = 3;
const SAMPLE_CHARS = 20_000;

const simplifiedSet = new Set(SIMPLIFIED_ONLY);
const traditionalSet = new Set(TRADITIONAL_ONLY);

export function chineseScriptOf(text: string): "zh-Hans" | "zh-Hant" | null {
  let simplified = 0;
  let traditional = 0;
  for (const char of text.slice(0, SAMPLE_CHARS)) {
    if (simplifiedSet.has(char)) simplified++;
    else if (traditionalSet.has(char)) traditional++;
  }
  if (traditional >= MIN_EVIDENCE && traditional > simplified * DOMINANCE) return "zh-Hant";
  return simplified >= MIN_EVIDENCE && simplified > traditional * DOMINANCE ? "zh-Hans" : null;
}
