import { isInsideAny, letterCount, SUBSTRING_BOUNDARY, touchesAny, type EntityLanguageRules, type NameCandidate, type TextRange } from "./shared";

interface CjkProfile {
  id: string;
  runCharacter: RegExp;
  splitters: ReadonlySet<string>;
}

const LATIN_WORD_PATTERN = /\p{Script=Latin}[\p{Script=Latin}\p{M}]*/gu;
const MIN_PIECE_LETTERS = 2;
const MIN_LATIN_LETTERS = 2;
const MAX_UNIT_CHARS = 120;

const CHINESE_SPLITTERS = "的了吗呢吧啊嘛呀哦嗯呐么我你他她它们";
const JAPANESE_SPLITTERS = "君様氏殿";

const isCovered = (offset: number, covered: readonly TextRange[]): boolean => covered.some((range) => range.start <= offset && offset < range.end);

function findLatinCandidates(unit: string, covered: readonly TextRange[]): NameCandidate[] {
  const candidates: NameCandidate[] = [];
  for (const match of unit.matchAll(LATIN_WORD_PATTERN)) {
    const token = match[0];
    const start = match.index!;
    const range = { start, end: start + token.length };
    if (token.length >= MIN_LATIN_LETTERS && token[0] !== token[0].toLowerCase() && !isInsideAny(range, covered)) candidates.push({ ...range, key: token.toLowerCase() });
  }
  return candidates;
}

function createCjkRules({ id, runCharacter, splitters }: CjkProfile): EntityLanguageRules {
  return {
    id,
    cueJoiner: "",
    maxUnitChars: MAX_UNIT_CHARS,
    lockBoundary: SUBSTRING_BOUNDARY,
    buildLexicon: () => new Set<string>(),
    findCandidates(unit, covered) {
      const candidates: NameCandidate[] = [];
      let start = -1;
      let offset = 0;
      const close = (end: number): void => {
        if (start < 0) return;
        const range = { start, end };
        const length = end - start;
        if (length >= MIN_PIECE_LETTERS || touchesAny(range, covered)) candidates.push({ ...range, key: unit.slice(start, end) });
        start = -1;
      };
      for (const character of unit) {
        if (isCovered(offset, covered) || !runCharacter.test(character) || splitters.has(character)) close(offset);
        else if (start < 0) start = offset;
        offset += character.length;
      }
      close(offset);
      return [...candidates, ...findLatinCandidates(unit, covered)];
    },
    isPlausibleName: (surface) => letterCount(surface) >= MIN_PIECE_LETTERS && !/\s/.test(surface),
  };
}

export const chineseRules = createCjkRules({ id: "chinese", runCharacter: /[\p{Script=Han}·•・]/u, splitters: new Set(CHINESE_SPLITTERS) });

export const japaneseRules = createCjkRules({ id: "japanese", runCharacter: /[\p{Script=Han}\p{Script=Katakana}ー・々〆]/u, splitters: new Set(JAPANESE_SPLITTERS) });
