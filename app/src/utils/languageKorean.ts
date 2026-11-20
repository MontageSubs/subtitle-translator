const SYLLABLE_START = 0xac00;
const SYLLABLE_END = 0xd7a3;
const SYLLABLES_PER_INITIAL = 588;
const CONJOINING_INITIAL_START = 0x1100;
const HANGUL_CHARACTER = /[ᄀ-ᇿㄱ-ㆎ가-힣]/;
const INITIALS_ONLY = /^[ᄀ-ᄒ]+$/;
const WHITESPACE = /\s+/g;

const KOREAN_ALIASES: Readonly<Record<string, readonly string[]>> = {
  ar: ["아라비아어"],
  de: ["독어", "도이치어"],
  es: ["서반아어", "에스파냐어"],
  fa: ["이란어"],
  fil: ["타갈로그어", "필리피노어"],
  fr: ["불어"],
  id: ["인니어"],
  it: ["이태리어"],
  ja: ["일어"],
  ko: ["한글", "국어"],
  ms: ["말레이시아어"],
  nl: ["홀란드어", "화란어", "네덜란드"],
  pt: ["브라질어", "포르투갈"],
  ru: ["노어"],
  tl: ["타갈로그어"],
  tr: ["터키어", "터키"],
  zh: ["중문", "중국"],
};

const jamoSequence = (text: string): string => text.normalize("NFKD").replace(WHITESPACE, "");

function initialsOf(text: string): string {
  let initials = "";
  for (const character of text.normalize("NFC")) {
    const codePoint = character.codePointAt(0) as number;
    if (codePoint >= SYLLABLE_START && codePoint <= SYLLABLE_END) initials += String.fromCodePoint(CONJOINING_INITIAL_START + Math.floor((codePoint - SYLLABLE_START) / SYLLABLES_PER_INITIAL));
  }
  return initials;
}

export function containsHangul(text: string): boolean {
  return HANGUL_CHARACTER.test(text);
}

export function matchesKoreanQuery(query: string, names: readonly string[], code: string): boolean {
  const candidates = [...names, ...(KOREAN_ALIASES[code] ?? KOREAN_ALIASES[code.split("-")[0]] ?? [])];
  const needle = jamoSequence(query.trim());
  return INITIALS_ONLY.test(needle) ? candidates.some((candidate) => initialsOf(candidate).includes(needle)) : candidates.some((candidate) => jamoSequence(candidate).includes(needle));
}
