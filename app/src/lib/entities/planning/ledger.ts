import type { RecognitionProfile } from "../profile";
import type { RecognitionUnit } from "../units";
import type { WordPriors } from "../knowledge/priors";
import { isSentenceInitial, type Token } from "../knowledge/tokens";

export interface SentenceEntry {
  unit: RecognitionUnit;
  tokens: readonly Token[];
}

export interface SentenceGroup {
  index: number;
  members: readonly number[];
}

export interface LedgerEntry {
  key: string;
  frequency: number;
  groups: number[];
  midCapital: number;
  initialCapital: number;
  lowercase: number;
}

export type CandidateTier = "A" | "B" | "none";

export interface Ledger {
  readonly entries: ReadonlyMap<string, LedgerEntry>;
  readonly groups: readonly SentenceGroup[];
  readonly groupKeys: readonly (readonly string[])[];
  usePriors(priors: WordPriors): void;
  readonly documentCased: boolean;
  tierOf(key: string): CandidateTier;
  excludedFrequent(limit: number): string[];
}

const MIN_DOCUMENT_CASE_UNITS = 20;
const MIN_CAPITALIZED_SHARE = 0.5;
const MIN_WORD_LENGTH = 2;
const AUDIT_MIN_FREQUENCY = 6;
const LETTER_PATTERN = /\p{L}/u;
const UPPERCASE_PATTERN = /\p{Lu}/gu;
const LOWERCASE_TEST = /\p{Ll}/u;
const MIN_ALL_CAPS_LETTERS = 2;

export const isAllCapsSentence = (text: string): boolean => (text.match(UPPERCASE_PATTERN)?.length ?? 0) >= MIN_ALL_CAPS_LETTERS && !LOWERCASE_TEST.test(text);

export const isCaseInformative = (text: string, profile: RecognitionProfile): boolean => profile.cased && LOWERCASE_TEST.test(text) && !isAllCapsSentence(text);

export function isDocumentCased(units: readonly RecognitionUnit[], profile: RecognitionProfile): boolean {
  if (!profile.cased) return false;
  let lettered = 0;
  let capitalized = 0;
  for (const { text } of units) {
    const first = text.match(LETTER_PATTERN)?.[0];
    if (first === undefined) continue;
    lettered += 1;
    if (first !== first.toLowerCase()) capitalized += 1;
  }
  return lettered >= MIN_DOCUMENT_CASE_UNITS && capitalized / lettered >= MIN_CAPITALIZED_SHARE;
}

const isCapitalized = (text: string): boolean => text[0] !== text[0].toLowerCase();
const isLowercaseWord = (text: string): boolean => text === text.toLowerCase() && text !== text.toUpperCase();

function groupSentences(sentences: readonly SentenceEntry[]): SentenceGroup[] {
  const byText = new Map<string, number[]>();
  sentences.forEach(({ unit }, index) => byText.set(unit.text, [...(byText.get(unit.text) ?? []), index]));
  return [...byText.values()].map((members) => ({ index: members[0], members }));
}

export function buildLedger(sentences: readonly SentenceEntry[], profile: RecognitionProfile, initialPriors: WordPriors, documentCased: boolean): Ledger {
  let priors = initialPriors;
  const entries = new Map<string, LedgerEntry>();
  const groups = groupSentences(sentences);
  const groupKeys: string[][] = [];
  groups.forEach((group, groupIndex) => {
    const { unit, tokens } = sentences[group.index];
    const informative = isCaseInformative(unit.text, profile);
    const present = new Set<string>();
    tokens.forEach((token, position) => {
      if (token.numeric || (profile.spaced && token.text.length < MIN_WORD_LENGTH)) return;
      const entry = entries.get(token.key) ?? { key: token.key, frequency: 0, groups: [], midCapital: 0, initialCapital: 0, lowercase: 0 };
      entries.set(token.key, entry);
      entry.frequency += group.members.length;
      if (!present.has(token.key)) {
        present.add(token.key);
        entry.groups.push(groupIndex);
      }
      if (!informative) return;
      if (isLowercaseWord(token.text)) entry.lowercase += group.members.length;
      else if (isCapitalized(token.text)) {
        if (isSentenceInitial(unit.text, tokens, position)) entry.initialCapital += group.members.length;
        else entry.midCapital += group.members.length;
      }
    });
    groupKeys.push([...present]);
  });

  const casingTrusted = profile.cased && documentCased;
  const tierOf = (key: string): CandidateTier => {
    const entry = entries.get(key);
    if (!entry) return "none";
    if (!profile.cased || !casingTrusted) return "A";
    const strongShape = entry.midCapital > 0;
    const initialOnly = entry.initialCapital > 0 && entry.lowercase === 0 && !priors.isPlain(key);
    if (!strongShape && !initialOnly) return "none";
    return entry.frequency >= 2 ? "A" : "B";
  };

  const candidatesOf = (): string[][] => groupKeys.map((keys) => keys.filter((key) => tierOf(key) !== "none"));
  let candidateGroupKeys = candidatesOf();
  return {
    entries,
    groups,
    get groupKeys() {
      return candidateGroupKeys;
    },
    usePriors(next) {
      priors = next;
      candidateGroupKeys = candidatesOf();
    },
    documentCased,
    tierOf,
    excludedFrequent(limit) {
      if (!casingTrusted) return [];
      return [...entries.values()]
        .filter((entry) => tierOf(entry.key) === "none" && entry.frequency >= AUDIT_MIN_FREQUENCY && !priors.isCommon(entry.key))
        .sort((left, right) => right.frequency - left.frequency)
        .slice(0, limit)
        .map(({ key }) => key);
    },
  };
}
