import type { NerEntity } from "../models/ner/decode";
import { normalizeTermKey } from "./termKey";

export interface EntityCandidate {
  source: string;
  type: string;
}

interface CandidateGroup {
  type: string;
  surface: string;
  occurrences: number;
}

export interface CollectorSnapshot {
  groups: [string, CandidateGroup][];
  emitted: string[];
}

export interface CandidateCollector {
  add(entities: readonly NerEntity[], knownKeys: ReadonlySet<string>): EntityCandidate[];
  snapshot(): CollectorSnapshot;
}

export interface CandidateOptions {
  caseSensitive: boolean;
  isPlausible(surface: string): boolean;
  restored?: CollectorSnapshot;
}

const MIN_SCORE: Readonly<Record<string, number>> = { PER: 0.85, LOC: 0.9, ORG: 0.9 };
const MIN_OCCURRENCES: Readonly<Record<string, number>> = { PER: 1, LOC: 2, ORG: 2 };
const MAX_CANDIDATES = 300;
const EDGE_PUNCTUATION_PATTERN = /^[\p{P}\p{S}\s]+|[\p{P}\p{S}\s]+$/gu;

const cleanSurface = (text: string): string => text.replace(EDGE_PUNCTUATION_PATTERN, "");

export function createCandidateCollector({ caseSensitive, isPlausible, restored }: CandidateOptions): CandidateCollector {
  const groups = new Map<string, CandidateGroup>(restored?.groups);
  const emitted = new Set<string>(restored?.emitted);
  return {
    add(entities, knownKeys) {
      const fresh: EntityCandidate[] = [];
      for (const entity of entities) {
        const minimum = MIN_SCORE[entity.type];
        const surface = cleanSurface(entity.text);
        if (minimum === undefined || entity.score < minimum || !isPlausible(surface)) continue;
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
    snapshot: () => ({ groups: [...groups], emitted: [...emitted] }),
  };
}
