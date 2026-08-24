import { Glossary } from "./types";

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


const BUNDLED_DICTIONARIES = import.meta.glob("../dictionaries/*.json", { eager: false }) as Record<string, () => Promise<{ default: DictionaryEntry[] }>>;

function dictionaryPath(languageCode: string): string {
  return `../dictionaries/${languageCode}.json`;
}

export async function loadBundledDictionary(languageCode: string): Promise<DictionaryEntry[]> {
  const loader = BUNDLED_DICTIONARIES[dictionaryPath(languageCode)];
  if (!loader) return [];
  try {
    return (await loader()).default;
  } catch {
    return [];
  }
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

export function glossaryToEntries(glossary: Glossary): DictionaryEntry[] {
  return Object.entries(glossary).map(([source, target]) => ({ source, target }));
}

export function parseDictionaryJson(content: string): DictionaryEntry[] {
  const parsed = JSON.parse(content);
  if (!Array.isArray(parsed)) throw new Error("dictionary file must be a JSON array");
  return parsed
    .filter((row): row is DictionaryEntry => typeof row?.source === "string" && typeof row?.target === "string")
    .map((row) => ({ source: row.source.trim(), target: row.target.trim() }))
    .filter((row) => row.source);
}

export function serializeDictionaryJson(entries: DictionaryEntry[]): string {
  return JSON.stringify(entries.filter((e) => e.source.trim()), null, 2);
}
