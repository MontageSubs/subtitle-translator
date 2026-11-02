import type { NerEntity } from "../models/ner/decode";
import type { CandidateEvidence } from "./acceptance";
import { normalizeTermKey } from "./termKey";

interface EntityCandidate {
  source: string;
  type: string;
}

interface CandidateGroup {
  type: string;
  surface: string;
  occurrences: number;
  bestScore: number;
}

export interface CollectorSnapshot {
  groups: [string, CandidateGroup][];
  emitted: string[];
}

interface CollectionResult {
  fresh: EntityCandidate[];
  strong: boolean[];
}

export interface CandidateCollector {
  add(entities: readonly NerEntity[], knownKeys: ReadonlySet<string>, caseInformative: boolean): CollectionResult;
  snapshot(): CollectorSnapshot;
}

export interface CandidateOptions {
  caseSensitive: boolean;
  isPlausible(surface: string, caseInformative: boolean): boolean;
  isExcluded(normalizedKey: string): boolean;
  accepts(candidate: CandidateEvidence): boolean;
  restored?: CollectorSnapshot;
}

const MIN_SCORE: Readonly<Record<string, number>> = { PER: 0.85, LOC: 0.9, ORG: 0.9 };
const MAX_CANDIDATES = 300;
const EDGE_PUNCTUATION_PATTERN = /^[\p{P}\p{S}\s]+|[\p{P}\p{S}\s]+$/gu;
const PERSON_TYPE = "PER";

const POSSESSIVE_SUFFIX_PATTERN = /['’]s$/i;

const cleanSurface = (text: string): string => text.replace(EDGE_PUNCTUATION_PATTERN, "").replace(POSSESSIVE_SUFFIX_PATTERN, "");

const titleCaseWord = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();

function canonicalSurface(surface: string, type: string, caseInformative: boolean): string {
  const shouted = surface === surface.toUpperCase() && surface !== surface.toLowerCase();
  return type === PERSON_TYPE && !caseInformative && shouted ? surface.split(" ").map(titleCaseWord).join(" ") : surface;
}

export function createCandidateCollector({ caseSensitive, isPlausible, isExcluded, accepts, restored }: CandidateOptions): CandidateCollector {
  const groups = new Map<string, CandidateGroup>(restored?.groups);
  const emitted = new Set<string>(restored?.emitted);
  return {
    add(entities, knownKeys, caseInformative) {
      const fresh: EntityCandidate[] = [];
      const strong = entities.map((entity) => entity.score >= (MIN_SCORE[entity.type] ?? Infinity));
      for (const entity of entities) {
        const minimum = MIN_SCORE[entity.type];
        const surface = canonicalSurface(cleanSurface(entity.text), entity.type, caseInformative);
        if (minimum === undefined || entity.score < minimum || !isPlausible(surface, caseInformative)) continue;
        if (isExcluded(normalizeTermKey(surface, false))) continue;
        const key = normalizeTermKey(surface, caseSensitive);
        if (emitted.has(key) || knownKeys.has(key)) continue;
        const group = groups.get(key) ?? { type: entity.type, surface, occurrences: 0, bestScore: 0 };
        group.occurrences += 1;
        group.bestScore = Math.max(group.bestScore, entity.score);
        groups.set(key, group);
        if (!accepts({ surface: group.surface, type: group.type, occurrences: group.occurrences, bestScore: group.bestScore }) || emitted.size >= MAX_CANDIDATES) continue;
        emitted.add(key);
        fresh.push({ source: group.surface, type: group.type });
      }
      return { fresh, strong };
    },
    snapshot: () => ({ groups: [...groups].map(([key, group]) => [key, { ...group }]), emitted: [...emitted] }),
  };
}
