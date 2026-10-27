import type { DictionaryEntry } from "../../utils/dictionary";
import { knownTermKeys, normalizeTermKey } from "./termKey";

export interface MergeResult {
  entries: DictionaryEntry[];
  added: number;
}

export function mergeRecognizedTerms(existing: DictionaryEntry[], recognized: readonly DictionaryEntry[], caseSensitive: boolean): MergeResult {
  const entries = [...existing];
  const known = knownTermKeys(existing, caseSensitive);
  let added = 0;
  for (const entry of recognized) {
    if (known.has(normalizeTermKey(entry.source, caseSensitive))) continue;
    entries.push(entry);
    knownTermKeys([entry], caseSensitive).forEach((key) => known.add(key));
    added += 1;
  }
  return { entries, added };
}
