import { languageKey } from "../../common/languageCodes";

export type FontPlatform = "windows" | "apple" | "android";

type FontFamily = { languages: readonly string[] } & Record<FontPlatform, string>;

const LATIN_FAMILY: FontFamily = { languages: [], windows: "Arial", apple: "Arial", android: "Roboto" };

const FAMILIES: readonly FontFamily[] = [
  { languages: ["zh-hans"], windows: "Microsoft YaHei", apple: "PingFang SC", android: "Noto Sans CJK SC" },
  { languages: ["zh-hant", "yue"], windows: "Microsoft JhengHei", apple: "PingFang TC", android: "Noto Sans CJK TC" },
  { languages: ["ja"], windows: "Yu Gothic", apple: "Hiragino Sans", android: "Noto Sans CJK JP" },
  { languages: ["ko"], windows: "Malgun Gothic", apple: "Apple SD Gothic Neo", android: "Noto Sans CJK KR" },
  { languages: ["ar", "fa", "ur", "ps", "sd", "ug", "ckb", "prs", "ks"], windows: "Arial", apple: "Geeza Pro", android: "Noto Sans Arabic" },
  { languages: ["he", "yi"], windows: "Arial", apple: "Arial Hebrew", android: "Noto Sans Hebrew" },
  { languages: ["hi", "ne", "mr", "sa", "gom", "mai", "doi", "bho", "awa", "brx", "hne"], windows: "Nirmala UI", apple: "Kohinoor Devanagari", android: "Noto Sans Devanagari" },
  { languages: ["bn", "as"], windows: "Nirmala UI", apple: "Bangla Sangam MN", android: "Noto Sans Bengali" },
  { languages: ["pa"], windows: "Nirmala UI", apple: "Gurmukhi Sangam MN", android: "Noto Sans Gurmukhi" },
  { languages: ["gu"], windows: "Nirmala UI", apple: "Gujarati Sangam MN", android: "Noto Sans Gujarati" },
  { languages: ["ta"], windows: "Nirmala UI", apple: "Tamil Sangam MN", android: "Noto Sans Tamil" },
  { languages: ["te"], windows: "Nirmala UI", apple: "Telugu Sangam MN", android: "Noto Sans Telugu" },
  { languages: ["kn"], windows: "Nirmala UI", apple: "Kannada Sangam MN", android: "Noto Sans Kannada" },
  { languages: ["ml"], windows: "Nirmala UI", apple: "Malayalam Sangam MN", android: "Noto Sans Malayalam" },
  { languages: ["si"], windows: "Nirmala UI", apple: "Sinhala Sangam MN", android: "Noto Sans Sinhala" },
  { languages: ["or"], windows: "Nirmala UI", apple: "Oriya Sangam MN", android: "Noto Sans Oriya" },
  { languages: ["th"], windows: "Leelawadee UI", apple: "Thonburi", android: "Noto Sans Thai" },
  { languages: ["lo"], windows: "Leelawadee UI", apple: "Lao Sangam MN", android: "Noto Sans Lao" },
  { languages: ["km"], windows: "Leelawadee UI", apple: "Khmer Sangam MN", android: "Noto Sans Khmer" },
  { languages: ["my", "shn"], windows: "Myanmar Text", apple: "Myanmar Sangam MN", android: "Noto Sans Myanmar" },
  { languages: ["bo", "dz"], windows: "Microsoft Himalaya", apple: "Kailasa", android: "Noto Serif Tibetan" },
  { languages: ["hy"], windows: "Sylfaen", apple: "Mshtakan", android: "Noto Sans Armenian" },
  { languages: ["ka"], windows: "Sylfaen", apple: "Arial Unicode MS", android: "Noto Sans Georgian" },
  { languages: ["am", "ti"], windows: "Nyala", apple: "Kefa", android: "Noto Sans Ethiopic" },
  { languages: ["dv"], windows: "MV Boli", apple: "Arial Unicode MS", android: "Noto Sans Thaana" },
  { languages: ["iu"], windows: "Gadugi", apple: "Euphemia UCAS", android: "Noto Sans Canadian Aboriginal" },
];

const FAMILY_BY_LANGUAGE: ReadonlyMap<string, FontFamily> = new Map(
  FAMILIES.flatMap((family) => family.languages.map((language) => [language, family] as const)),
);

function familyOf(code: string | null | undefined): FontFamily {
  return FAMILY_BY_LANGUAGE.get(languageKey(code)) ?? LATIN_FAMILY;
}

export function assFontFor(code: string | null | undefined, platform: FontPlatform): string {
  return familyOf(code)[platform];
}

export function sharesFontFamily(first: string | null | undefined, second: string | null | undefined): boolean {
  return familyOf(first) === familyOf(second);
}
