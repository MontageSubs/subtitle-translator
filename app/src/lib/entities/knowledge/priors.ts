import type { LexiconLanguage } from "../../models/lexicon/format";

export interface WordPriors {
  isCommon(key: string): boolean;
  isNameLike(key: string): boolean;
  isPlain(key: string): boolean;
}

export const NO_PRIORS: WordPriors = { isCommon: () => false, isNameLike: () => false, isPlain: () => false };

export function createWordPriors({ common, names }: LexiconLanguage): WordPriors {
  const commonWords = new Set(common);
  const nameWords = new Set(names);
  return {
    isCommon: (key) => commonWords.has(key),
    isNameLike: (key) => nameWords.has(key),
    isPlain: (key) => commonWords.has(key) && !nameWords.has(key),
  };
}
