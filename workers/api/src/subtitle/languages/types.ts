import type { Script } from "../common/languageCodes";

export type { Script };
export type WordCutter = (text: string) => string[];
export type QuotePair = readonly [open: string, close: string];

export interface SourceRules {
  readonly usesLatinPunctuation: boolean;
  readonly resolvesGlossaryStutter: boolean;
  stripLetterStutter(text: string): string;
  hasResidualText(text: string): boolean;
  isShortReply(text: string): boolean;
  isIsolatedShort(text: string, maxWords: number): boolean;
}

export interface TargetRules {
  readonly quotes: QuotePair | null;
  readonly stripsCjkTerminalPunctuation: boolean;
  readonly anchorsToSourcePunctuation: boolean;
  readonly collapsesTermWhitespace: boolean;
  readonly loadWordCutter?: () => Promise<WordCutter | null>;
}

export interface LanguageModule {
  readonly script: Script;
  readonly source: SourceRules;
  targetFor(code: string): TargetRules;
}

export interface LanguageFamily {
  readonly codes: readonly string[];
  readonly module: LanguageModule;
}
