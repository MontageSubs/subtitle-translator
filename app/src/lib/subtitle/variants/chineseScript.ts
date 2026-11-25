import { baseLanguage } from "../common/languageCodes";

const SIMPLIFIED_MARKERS = new Set("们这个来会吗没说为对还过样时开现给点让谢别话见儿妈发当该听经爱觉从问间诉谁错进欢国关无车尔应电认长帮动请实机杀亲东带种头学两许钱离将马记题确结办总变难气谈几处备门员试证罗战乐队与远须师约号报够医兴枪决伤声识军亚内运万宝选达击飞买兰担护续条论绝张继丽疯写紧钟");
const TRADITIONAL_MARKERS = new Set("們這個來麼嗎會沒說為對還過樣時開現點謝讓給別話裡見兒該聽媽發當經覺愛從後問間錯誰種訴無進長幫歡應請認車實動關電殺機國親帶爾東兩頭馬錢學記離題許裏邊幹辦結總體變場確難剛處計談氣備幾準將約試戰門羅員樂報隊證與遠夠須興槍師決識傷號貝內聲亞萬軍達選擔運買單續簡飛擊");
const MIN_EVIDENCE = 3;
const DOMINANCE = 2;
const SAMPLE_CHARS = 20_000;

export function chineseScriptOf(text: string): "zh-Hans" | "zh-Hant" | null {
  let simplified = 0;
  let traditional = 0;
  for (const char of text.slice(0, SAMPLE_CHARS)) {
    if (SIMPLIFIED_MARKERS.has(char)) simplified++;
    else if (TRADITIONAL_MARKERS.has(char)) traditional++;
  }
  if (traditional >= MIN_EVIDENCE && traditional > simplified * DOMINANCE) return "zh-Hant";
  return simplified >= MIN_EVIDENCE && simplified > traditional * DOMINANCE ? "zh-Hans" : null;
}

export function withChineseScript(code: string, text: string): string {
  return baseLanguage(code) === "zh" ? chineseScriptOf(text) ?? code : code;
}
