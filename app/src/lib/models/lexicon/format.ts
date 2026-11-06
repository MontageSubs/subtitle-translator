export interface LexiconLanguage {
  common: readonly string[];
  names: readonly string[];
}

export interface LexiconFile {
  version: 1;
  languages: Readonly<Record<string, LexiconLanguage>>;
}
