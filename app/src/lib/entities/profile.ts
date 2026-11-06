import { baseLanguage } from "../subtitle/common/languageCodes";
import { isCasedLanguage } from "./nameScripts";

export const RECOGNITION_VERSION = 1;

type ProfileId = "cased" | "uncased" | "chinese" | "japanese";

export interface CliticRules {
  readonly prefix: RegExp | null;
  readonly suffix: RegExp | null;
}

export interface RecognitionProfile {
  readonly id: ProfileId;
  readonly locale: string;
  readonly joiner: string;
  readonly maxUnitChars: number;
  readonly cased: boolean;
  readonly spaced: boolean;
  readonly clitics: CliticRules;
  isPlausibleName(surface: string, caseInformative: boolean): boolean;
}

const LETTER_PATTERN = /\p{L}/gu;
const WHITESPACE_PATTERN = /\s+/;
const MIN_NAME_LETTERS = 2;
const MAX_NAME_WORDS = 5;
const SPACED_UNIT_CHARS = 360;
const UNSPACED_UNIT_CHARS = 160;

const NO_CLITICS: CliticRules = { prefix: null, suffix: null };
const APOSTROPHE = "['\u2019]";
const ELISION_FOLLOWER = "(?=[aeiouyh\u00e0\u00e2\u00e4\u00e6\u00e8\u00e9\u00ea\u00eb\u00ec\u00ee\u00ef\u00f2\u00f4\u00f6\u0153\u00f9\u00fb\u00fc\u00ff])";
const elidingPrefix = (letters: string): RegExp => new RegExp(`^(?:${letters})${APOSTROPHE}${ELISION_FOLLOWER}`, "iu");
const CLITICS_BY_LOCALE: Readonly<Record<string, CliticRules>> = {
  en: { prefix: null, suffix: new RegExp(`(?:${APOSTROPHE}(?:s|ll|m|ve|re|d)|n${APOSTROPHE}t)$`, "iu") },
  de: { prefix: null, suffix: new RegExp(`${APOSTROPHE}s$`, "iu") },
  fr: { prefix: elidingPrefix("[ldjtmnsc]|qu|jusqu|lorsqu|puisqu"), suffix: null },
  it: { prefix: elidingPrefix("[lcdmstvn]|un|dell|all|nell|sull|dall|quell|quest|sant|anch|com|nient"), suffix: null },
};

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
  clitics: CLITICS_BY_LOCALE[locale] ?? NO_CLITICS,
  isPlausibleName: (surface, caseInformative) => letterCount(surface) >= MIN_NAME_LETTERS && wordCount(surface) <= MAX_NAME_WORDS && (!caseInformative || startsUppercase(surface)),
});

const uncasedProfile = (locale: string): RecognitionProfile => ({
  id: "uncased",
  locale,
  joiner: " ",
  maxUnitChars: SPACED_UNIT_CHARS,
  cased: false,
  spaced: true,
  clitics: NO_CLITICS,
  isPlausibleName: (surface) => letterCount(surface) >= MIN_NAME_LETTERS && wordCount(surface) <= MAX_NAME_WORDS,
});

const unspacedProfile = (id: "chinese" | "japanese", locale: string): RecognitionProfile => ({
  id,
  locale,
  joiner: "",
  maxUnitChars: UNSPACED_UNIT_CHARS,
  cased: false,
  spaced: false,
  clitics: NO_CLITICS,
  isPlausibleName: (surface) => letterCount(surface) >= MIN_NAME_LETTERS && !WHITESPACE_PATTERN.test(surface),
});

export function profileFor(sourceLang: string): RecognitionProfile {
  const base = baseLanguage(sourceLang);
  if (base === "ja") return unspacedProfile("japanese", "ja");
  if (base === "zh" || base === "yue") return unspacedProfile("chinese", base);
  return isCasedLanguage(base) ? casedProfile(base) : uncasedProfile(base);
}
