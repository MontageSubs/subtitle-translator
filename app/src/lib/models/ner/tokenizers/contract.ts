export interface Word {
  start: number;
  end: number;
  pieces: number[];
}

export interface NerTokenizer {
  readonly classify: number;
  readonly separate: number;
  readonly padding: number;
  readonly unitSeparator: string;
  words(text: string): Word[];
}
