import { baseLanguage, scriptOf } from "../subtitle/common/languageCodes";

export const RECOGNITION_VERSION = 2;

export type ProfileId = "cased" | "uncased" | "chinese" | "japanese";

export interface RecognitionProfile {
  readonly id: ProfileId;
  readonly locale: string;
  readonly joiner: string;
  readonly maxUnitChars: number;
  readonly cased: boolean;
  readonly spaced: boolean;
  isPlausibleName(surface: string, caseInformative: boolean): boolean;
}

const LETTER_PATTERN = /\p{L}/gu;
const WHITESPACE_PATTERN = /\s+/;
const MIN_NAME_LETTERS = 2;
const MAX_NAME_WORDS = 5;
const SPACED_UNIT_CHARS = 360;
const UNSPACED_UNIT_CHARS = 160;
const CASED_SCRIPTS: ReadonlySet<string | undefined> = new Set(["latin", "cyrillic", "greek"]);

const letterCount = (text: string): number => text.match(LETTER_PATTERN)?.length ?? 0;
const wordCount = (text: string): number => text.trim().split(WHITESPACE_PATTERN).length;
const startsUppercase = (text: string): boolean => {
  const first = text.match(/\p{L}/u)?.[0];
  return first !== undefined && first !== first.toLowerCase();
};

const casedProfile = (locale: string): RecognitionProfile => ({
  id: "cased",
  locale,
  joiner: " ",
  maxUnitChars: SPACED_UNIT_CHARS,
  cased: true,
  spaced: true,
  isPlausibleName: (surface, caseInformative) => letterCount(surface) >= MIN_NAME_LETTERS && wordCount(surface) <= MAX_NAME_WORDS && (!caseInformative || startsUppercase(surface)),
});

const uncasedProfile = (locale: string): RecognitionProfile => ({
  id: "uncased",
  locale,
  joiner: " ",
  maxUnitChars: SPACED_UNIT_CHARS,
  cased: false,
  spaced: true,
  isPlausibleName: (surface) => letterCount(surface) >= MIN_NAME_LETTERS && wordCount(surface) <= MAX_NAME_WORDS,
});

const unspacedProfile = (id: "chinese" | "japanese", locale: string): RecognitionProfile => ({
  id,
  locale,
  joiner: "",
  maxUnitChars: UNSPACED_UNIT_CHARS,
  cased: false,
  spaced: false,
  isPlausibleName: (surface) => letterCount(surface) >= MIN_NAME_LETTERS && !WHITESPACE_PATTERN.test(surface),
});

export function profileFor(sourceLang: string): RecognitionProfile {
  const base = baseLanguage(sourceLang);
  if (base === "ja") return unspacedProfile("japanese", "ja");
  if (base === "zh" || base === "yue") return unspacedProfile("chinese", base);
  return CASED_SCRIPTS.has(scriptOf(sourceLang)) ? casedProfile(base) : uncasedProfile(base);
}
