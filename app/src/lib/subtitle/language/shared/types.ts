export type Script = "latin" | "cjk" | "cyrillic" | "arabic" | "devanagari" | "hebrew" | "greek" | "thai";

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

export interface SdhRules {
  stripsSpeakerTags: boolean;
}

export interface SourceRules {
  sdh: SdhRules | null;
  bilingualWithChineseByDefault: boolean;
}

export interface TargetRules {
  reading: ReadingProfile;
  lineBreak: LineBreakPolicy;
  assFont: string;
  alignsMusicToTop: boolean;
  loadWordCutter?: () => Promise<WordCutter | null>;
}

export interface LanguageModule {
  id: string;
  script: Script;
  source: SourceRules;
  target: TargetRules;
}
