export type ScriptFamily = "latin" | "cyrillic" | "cjk" | "other";

export type WordCutter = (text: string) => string[];

export interface OrthographyRule {
  noLineStart: Set<string>;
  noLineEnd: Set<string>;
  proclitics: Set<string>;
  enclitics: Set<string>;
  conjunctions: Set<string>;
}

export interface BreakCandidate {
  offset: number;
  totalLength: number;
  line1: string;
  line2: string;
  lastWord: string;
  nextWord: string;
  isSpaceBoundary: boolean;
}

export interface LineBreakPolicy {
  rule: OrthographyRule;
  score(candidate: BreakCandidate): number;
}

export interface ReadingProfile {
  maxCharsPerLine: number;
  speedCps: number;
}

export interface LanguageModule {
  id: string;
  baseCode: string;
  script: ScriptFamily;
  reading: ReadingProfile;
  lineBreak: LineBreakPolicy;
  bilingualWithChineseByDefault: boolean;
  assFont: string;
  loadWordCutter?: () => Promise<WordCutter | null>;
}
