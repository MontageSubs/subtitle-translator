export interface TextRange {
  start: number;
  end: number;
}

export interface NameCandidate extends TextRange {
  key: string;
}

export interface EntityLanguageRules {
  readonly id: string;
  readonly cueJoiner: string;
  readonly maxUnitChars: number;
  readonly lockBoundary: { readonly before: string; readonly after: string };
  buildLexicon(units: readonly string[]): Set<string>;
  findCandidates(unit: string, covered: readonly TextRange[], lexicon: ReadonlySet<string>): NameCandidate[];
  isPlausibleName(surface: string): boolean;
}

export const SENTENCE_END_PATTERN = /[.!?…。！？؟]["'”’»」』）)\]]*\s*$/u;

export const WORD_BOUNDARY = { before: "(?<![\\p{L}\\p{N}])", after: "(?![\\p{L}\\p{N}])" } as const;

export const SUBSTRING_BOUNDARY = { before: "", after: "" } as const;

const LETTER_PATTERN = /\p{L}/gu;
const WHITESPACE_PATTERN = /\s+/;

export const letterCount = (text: string): number => text.match(LETTER_PATTERN)?.length ?? 0;

export const wordCount = (text: string): number => text.trim().split(WHITESPACE_PATTERN).length;

export const overlaps = (left: TextRange, right: TextRange): boolean => left.start < right.end && right.start < left.end;

export const isInsideAny = (range: TextRange, containers: readonly TextRange[]): boolean => containers.some((container) => container.start <= range.start && range.end <= container.end);

export const touchesAny = (range: TextRange, others: readonly TextRange[]): boolean => others.some((other) => other.end === range.start || other.start === range.end);
