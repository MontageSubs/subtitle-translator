import { Glossary } from "../lib/subtitle/types";

export interface DictionaryEntry {
  source: string;
  target: string;
}

const NAME_SEPARATOR_PATTERN = /[·・]/;

function splitNamePair(original: string, translated: string): [string, string][] {
  const origTokens = original.split(/\s+/).filter(Boolean);
  const transTokens = translated.split(NAME_SEPARATOR_PATTERN).filter(Boolean);
  const pairs: [string, string][] = [[original, translated]];
  if (origTokens.length >= 2 && origTokens.length === transTokens.length) {
    pairs.push([origTokens[0], transTokens[0]]);
  }
  return pairs;
}

const BUNDLED_DICTIONARIES = import.meta.glob<DictionaryEntry[]>("../dictionaries/*.json", { eager: true, import: "default" });

export function bundledDictionary(languageCode: string): DictionaryEntry[] {
  return BUNDLED_DICTIONARIES[`../dictionaries/${languageCode}.json`] ?? [];
}

export function entriesToGlossary(entries: DictionaryEntry[]): Glossary {
  const glossary: Glossary = {};
  for (const { source, target } of entries) {
    for (const [term, mapped] of splitNamePair(source.trim(), target.trim())) {
      if (term && !(term in glossary)) glossary[term] = mapped;
    }
  }
  return glossary;
}

export function toStoredGlossary(entries: DictionaryEntry[]): Glossary | undefined {
  const glossary = entriesToGlossary(entries);
  return Object.keys(glossary).length ? glossary : undefined;
}

export function glossaryToEntries(glossary: Glossary): DictionaryEntry[] {
  return Object.entries(glossary).map(([source, target]) => ({ source, target }));
}
