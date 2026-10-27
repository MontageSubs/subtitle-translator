import { scriptOf } from "../subtitle/common/languageCodes";
import type { NerEntity } from "../models/ner/decode";
import { normalizeTermKey } from "./termKey";

export interface EntityCandidate {
  source: string;
  type: string;
  occurrences: number;
  score: number;
}

export interface CandidateOptions {
  sourceLang: string;
  caseSensitive: boolean;
  knownKeys: ReadonlySet<string>;
}

interface CandidateGroup {
  type: string;
  surfaces: Map<string, number>;
  scores: number[];
}

const PERSON_TYPE = "PER";
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

export function collectCandidates(entitiesByChunk: readonly NerEntity[][], { sourceLang, caseSensitive, knownKeys }: CandidateOptions): EntityCandidate[] {
  const latin = scriptOf(sourceLang) === "latin";
  const groups = new Map<string, CandidateGroup>();
  for (const entity of entitiesByChunk.flat()) {
    const minimum = MIN_SCORE[entity.type];
    const surface = cleanSurface(entity.text);
    if (minimum === undefined || entity.score < minimum || !isPlausible(surface, latin)) continue;
    const key = normalizeTermKey(surface, caseSensitive);
    if (knownKeys.has(key)) continue;
    const group: CandidateGroup = groups.get(key) ?? { type: entity.type, surfaces: new Map(), scores: [] };
    group.surfaces.set(surface, (group.surfaces.get(surface) ?? 0) + 1);
    group.scores.push(entity.score);
    groups.set(key, group);
  }
  const candidates: EntityCandidate[] = [];
  for (const { type, surfaces, scores } of groups.values()) {
    if (scores.length < MIN_OCCURRENCES[type]) continue;
    const [source] = [...surfaces].sort((left, right) => right[1] - left[1])[0];
    candidates.push({ source, type, occurrences: scores.length, score: scores.reduce((sum, score) => sum + score, 0) / scores.length });
  }
  const rank = (candidate: EntityCandidate): number => (candidate.type === PERSON_TYPE ? 1 : 0);
  return candidates.sort((left, right) => rank(right) - rank(left) || right.occurrences - left.occurrences).slice(0, MAX_CANDIDATES);
}
