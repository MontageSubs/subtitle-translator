import type { RecognitionProfile } from "./profile";
import type { Ledger } from "./planning/ledger";

export interface CandidateEvidence {
  surface: string;
  type: string;
  occurrences: number;
  bestScore: number;
}

const PERSON_TYPE = "PER";
const REPEATED_OCCURRENCES = 2;
const LONE_INITIAL_SCORE = 0.985;
const MULTIWORD_SCORE = 0.95;
const UNCASED_SINGLE_SCORE = 0.99;
const WHITESPACE_PATTERN = /\s+/;
const LOWERCASE_TEST = /\p{Ll}/u;

const firstWordKey = (surface: string): string => surface.split(WHITESPACE_PATTERN)[0].normalize("NFKC").toLowerCase();

export function createAcceptance(ledger: Ledger, profile: RecognitionProfile): (candidate: CandidateEvidence) => boolean {
  const casingTrusted = profile.cased && ledger.documentCased;
  return ({ surface, type, occurrences, bestScore }) => {
    const entry = ledger.entries.get(firstWordKey(surface));
    const recurs = (entry?.frequency ?? REPEATED_OCCURRENCES) > 1;
    const words = profile.spaced ? surface.split(WHITESPACE_PATTERN).length : 1;
    if (type === PERSON_TYPE) {
      const capitalizedOnlyAtSentenceStart = casingTrusted && words === 1 && entry !== undefined && entry.midCapital === 0 && entry.lowercase === 0;
      if (!capitalizedOnlyAtSentenceStart) return true;
      return recurs ? occurrences >= REPEATED_OCCURRENCES : bestScore >= LONE_INITIAL_SCORE;
    }
    if (occurrences >= REPEATED_OCCURRENCES) return true;
    if (!profile.cased) return bestScore >= UNCASED_SINGLE_SCORE && !recurs;
    return words >= 2 && LOWERCASE_TEST.test(surface) && bestScore >= MULTIWORD_SCORE;
  };
}
