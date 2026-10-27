import { scriptOf } from "../subtitle/common/languageCodes";
import type { NerEntity } from "../models/ner/decode";
import { normalizeTermKey } from "./termKey";

export interface EntityCandidate {
  source: string;
  type: string;
}

export interface CandidateCollector {
  add(entities: readonly NerEntity[], knownKeys: ReadonlySet<string>): EntityCandidate[];
}

export interface CandidateOptions {
  sourceLang: string;
  caseSensitive: boolean;
}

interface CandidateGroup {
  type: string;
  surface: string;
  occurrences: number;
}

const MIN_SCORE: Readonly<Record<string, number>> = { PER: 0.85, LOC: 0.9, ORG: 0.9 };
const MIN_OCCURRENCES: Readonly<Record<string, number>> = { PER: 1, LOC: 2, ORG: 2 };
const MAX_CANDIDATES = 300;
const MAX_WORDS = 5;
const MIN_LATIN_LETTERS = 2;
const MIN_CJK_CHARACTERS = 2;
const EDGE_PUNCTUATION_PATTERN = /^[\p{P}\p{S}\s]+|[\p{P}\p{S}\s]+$/gu;
const LETTER_PATTERN = /\p{L}/gu;
const FIRST_LETTER_PATTERN = /\p{L}/u;

function cleanSurface(text: string): string {
  return text.replace(EDGE_PUNCTUATION_PATTERN, "");
}

function isPlausible(surface: string, latin: boolean): boolean {
  const letters = surface.match(LETTER_PATTERN)?.length ?? 0;
  if (letters < (latin ? MIN_LATIN_LETTERS : MIN_CJK_CHARACTERS)) return false;
  if (!latin) return !/\s/.test(surface);
  if (surface.split(/\s+/).length > MAX_WORDS) return false;
  const first = surface.match(FIRST_LETTER_PATTERN)?.[0] ?? "";
  return first !== first.toLowerCase();
}

export function createCandidateCollector({ sourceLang, caseSensitive }: CandidateOptions): CandidateCollector {
  const latin = scriptOf(sourceLang) === "latin";
  const groups = new Map<string, CandidateGroup>();
  const emitted = new Set<string>();
  return {
    add(entities, knownKeys) {
      const fresh: EntityCandidate[] = [];
      for (const entity of entities) {
        const minimum = MIN_SCORE[entity.type];
        const surface = cleanSurface(entity.text);
        if (minimum === undefined || entity.score < minimum || !isPlausible(surface, latin)) continue;
        const key = normalizeTermKey(surface, caseSensitive);
        if (emitted.has(key) || knownKeys.has(key)) continue;
        const group = groups.get(key) ?? { type: entity.type, surface, occurrences: 0 };
        group.occurrences += 1;
        groups.set(key, group);
        if (group.occurrences < MIN_OCCURRENCES[group.type] || emitted.size >= MAX_CANDIDATES) continue;
        emitted.add(key);
        fresh.push({ source: group.surface, type: group.type });
      }
      return fresh;
    },
  };
}
