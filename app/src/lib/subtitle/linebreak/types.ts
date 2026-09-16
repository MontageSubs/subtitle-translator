export interface OrthographyRule {
  noLineStart: Set<string>;
  noLineEnd: Set<string>;
  proclitics: Set<string>;
  enclitics: Set<string>;
  conjunctions: Set<string>;
}
