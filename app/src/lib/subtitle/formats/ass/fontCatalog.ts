import { languageKey } from "../../common/languageCodes";

export type FontPlatform = "desktop" | "mobile";

interface FontFamily {
  languages: readonly string[];
  desktop: string;
  mobile: string;
}

const LATIN_FAMILY: FontFamily = { languages: [], desktop: "Arial", mobile: "Roboto" };

const FAMILIES: readonly FontFamily[] = [
  { languages: ["zh-hans"], desktop: "Microsoft YaHei", mobile: "Noto Sans CJK SC" },
  { languages: ["zh-hant", "yue"], desktop: "Microsoft JhengHei", mobile: "Noto Sans CJK TC" },
  { languages: ["ja"], desktop: "Yu Gothic", mobile: "Noto Sans CJK JP" },
  { languages: ["ko"], desktop: "Malgun Gothic", mobile: "Noto Sans CJK KR" },
  { languages: ["ar", "fa", "ur", "ps", "sd", "ug", "ckb", "prs", "ks"], desktop: "Arial", mobile: "Noto Sans Arabic" },
  { languages: ["he", "yi"], desktop: "Arial", mobile: "Noto Sans Hebrew" },
  { languages: ["hi", "ne", "mr", "sa", "gom", "mai", "doi", "bho", "awa", "brx", "hne"], desktop: "Nirmala UI", mobile: "Noto Sans Devanagari" },
  { languages: ["bn", "as"], desktop: "Nirmala UI", mobile: "Noto Sans Bengali" },
  { languages: ["pa"], desktop: "Nirmala UI", mobile: "Noto Sans Gurmukhi" },
  { languages: ["gu"], desktop: "Nirmala UI", mobile: "Noto Sans Gujarati" },
  { languages: ["ta"], desktop: "Nirmala UI", mobile: "Noto Sans Tamil" },
  { languages: ["te"], desktop: "Nirmala UI", mobile: "Noto Sans Telugu" },
  { languages: ["kn"], desktop: "Nirmala UI", mobile: "Noto Sans Kannada" },
  { languages: ["ml"], desktop: "Nirmala UI", mobile: "Noto Sans Malayalam" },
  { languages: ["si"], desktop: "Nirmala UI", mobile: "Noto Sans Sinhala" },
  { languages: ["or"], desktop: "Nirmala UI", mobile: "Noto Sans Oriya" },
  { languages: ["th"], desktop: "Leelawadee UI", mobile: "Noto Sans Thai" },
  { languages: ["lo"], desktop: "Leelawadee UI", mobile: "Noto Sans Lao" },
  { languages: ["km"], desktop: "Leelawadee UI", mobile: "Noto Sans Khmer" },
  { languages: ["my", "shn"], desktop: "Myanmar Text", mobile: "Noto Sans Myanmar" },
  { languages: ["bo", "dz"], desktop: "Microsoft Himalaya", mobile: "Noto Serif Tibetan" },
  { languages: ["hy"], desktop: "Sylfaen", mobile: "Noto Sans Armenian" },
  { languages: ["ka"], desktop: "Sylfaen", mobile: "Noto Sans Georgian" },
  { languages: ["am", "ti"], desktop: "Nyala", mobile: "Noto Sans Ethiopic" },
  { languages: ["dv"], desktop: "MV Boli", mobile: "Noto Sans Thaana" },
  { languages: ["iu"], desktop: "Gadugi", mobile: "Noto Sans Canadian Aboriginal" },
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
