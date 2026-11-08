type WindowsUiLanguage = "zh-hans" | "zh-hant" | "ja" | "ko";

const LOCALIZED_NAMES: Readonly<Record<string, Readonly<Partial<Record<WindowsUiLanguage, string>>>>> = {
  "Microsoft YaHei": { "zh-hans": "微软雅黑" },
  "Microsoft JhengHei": { "zh-hant": "微軟正黑體" },
  DengXian: { "zh-hans": "等线" },
  SimSun: { "zh-hans": "宋体" },
  NSimSun: { "zh-hans": "新宋体" },
  SimHei: { "zh-hans": "黑体" },
  KaiTi: { "zh-hans": "楷体" },
  FangSong: { "zh-hans": "仿宋" },
  MingLiU: { "zh-hant": "細明體" },
  PMingLiU: { "zh-hant": "新細明體" },
  "DFKai-SB": { "zh-hant": "標楷體" },
  "Yu Gothic": { ja: "游ゴシック" },
  "Yu Mincho": { ja: "游明朝" },
  Meiryo: { ja: "メイリオ" },
  "MS Gothic": { ja: "ＭＳ ゴシック" },
  "MS PGothic": { ja: "ＭＳ Ｐゴシック" },
  "MS Mincho": { ja: "ＭＳ 明朝" },
  "MS PMincho": { ja: "ＭＳ Ｐ明朝" },
  "Malgun Gothic": { ko: "맑은 고딕" },
  Gulim: { ko: "굴림" },
  Dotum: { ko: "돋움" },
  Batang: { ko: "바탕" },
  Gungsuh: { ko: "궁서" },
};

const TRADITIONAL_REGIONS: ReadonlySet<string> = new Set(["tw", "hk", "mo"]);

function windowsUiLanguageOf(browserLanguage: string): WindowsUiLanguage | null {
  const [language, ...rest] = browserLanguage.toLowerCase().split("-");
  if (language === "ja" || language === "ko") return language;
  if (language !== "zh") return null;
  return rest.includes("hant") || rest.some((part) => TRADITIONAL_REGIONS.has(part)) ? "zh-hant" : "zh-hans";
}

export function windowsLocalFontName(englishName: string, browserLanguage: string): string {
  const uiLanguage = windowsUiLanguageOf(browserLanguage);
  return (uiLanguage && LOCALIZED_NAMES[englishName]?.[uiLanguage]) || englishName;
}
