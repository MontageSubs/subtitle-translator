import { normalizeTermKey } from "../termKey";
import type { Ledger, SentenceEntry } from "./ledger";
import { isCaseInformative } from "./ledger";
import type { RecognitionProfile } from "../profile";
import type { Token } from "../knowledge/tokens";

interface RunTally {
  surface: string;
  count: number;
  hinted: boolean;
}

const RUN_GAP_PATTERN = /^[\s\-'’·•・]*$/;
const MIN_RUN_COUNT = 2;
const MAX_TERMS = 300;

const isCapitalized = (token: Token): boolean => token.text[0] !== token.text[0].toLowerCase();

export function findStatisticalTerms(sentences: readonly SentenceEntry[], ledger: Ledger, profile: RecognitionProfile, isExcluded: (normalizedKey: string) => boolean, hints: ReadonlySet<string>): string[] {
  if (!profile.cased) return [];
  const runs = new Map<string, RunTally>();
  for (const { index } of ledger.groups) {
    const { unit, tokens } = sentences[index];
    if (!isCaseInformative(unit.text, profile)) continue;
    for (let position = 0; position < tokens.length; position++) {
      if (!ledger.isStatisticalName(tokens[position].key) || !isCapitalized(tokens[position])) continue;
      let last = position;
      while (last + 1 < tokens.length && ledger.isStatisticalName(tokens[last + 1].key) && isCapitalized(tokens[last + 1]) && RUN_GAP_PATTERN.test(unit.text.slice(tokens[last].end, tokens[last + 1].start))) last += 1;
      const surface = unit.text.slice(tokens[position].start, tokens[last].stemEnd);
      const key = normalizeTermKey(surface, false);
      if (!isExcluded(key)) {
        const tally = runs.get(key) ?? { surface, count: 0, hinted: false };
        tally.count += 1;
        tally.hinted ||= last === position && hints.has(tokens[position].key);
        runs.set(key, tally);
      }
      position = last;
    }
  }
  return [...runs.values()]
    .filter(({ count, hinted }) => count >= MIN_RUN_COUNT || hinted)
    .sort((left, right) => right.count - left.count)
    .slice(0, MAX_TERMS)
    .map(({ surface }) => surface);
}
