import { entriesToGlossary, type GlossaryEntry } from "../../utils/glossary";

const WHITESPACE_PATTERN = /\s+/g;

export function normalizeTermKey(text: string, caseSensitive: boolean): string {
  const folded = text.normalize("NFKC").replace(WHITESPACE_PATTERN, " ").trim();
  return caseSensitive ? folded : folded.toLowerCase();
}

export function knownTermKeys(entries: GlossaryEntry[], caseSensitive: boolean): Set<string> {
  return new Set(Object.keys(entriesToGlossary(entries)).map((term) => normalizeTermKey(term, caseSensitive)));
}
