import type { NameExclusions } from "../exclusions";
import { normalizeTermKey } from "../termKey";
import type { Token } from "../knowledge/tokens";
import { isSentenceInitial } from "../knowledge/tokens";
import type { MaskOf } from "./ledger";

const MAX_SPAN_TOKENS = 4;
const SPACED_GAP_PATTERN = /^\s+$/;

const isCapitalized = (token: Token): boolean => !token.numeric && token.text[0] !== token.text[0].toLowerCase();

export function createPlaceMask(exclusions: NameExclusions, spaced: boolean): MaskOf {
  const gapIsClean = (text: string, left: Token, right: Token): boolean => (spaced ? SPACED_GAP_PATTERN.test(text.slice(left.end, right.start)) : left.end === right.start);

  const extendsName = (text: string, tokens: readonly Token[], first: number, last: number): boolean => {
    const next = tokens[last + 1];
    if (next && isCapitalized(next) && gapIsClean(text, tokens[last], next)) return true;
    const previous = tokens[first - 1];
    return previous !== undefined && isCapitalized(previous) && gapIsClean(text, previous, tokens[first]) && !isSentenceInitial(text, tokens, first - 1);
  };

  return (text, tokens) => {
    const masked = new Set<number>();
    for (let first = 0; first < tokens.length; first++) {
      if (!exclusions.mayStartWith(tokens[first].key)) continue;
      const longest = Math.min(tokens.length - 1, first + (spaced ? MAX_SPAN_TOKENS : MAX_SPAN_TOKENS + 2) - 1);
      for (let last = longest; last >= first; last--) {
        if (!exclusions.isExcluded(normalizeTermKey(text.slice(tokens[first].start, tokens[last].end), false))) continue;
        if (extendsName(text, tokens, first, last)) break;
        for (let position = first; position <= last; position++) masked.add(position);
        first = last;
        break;
      }
    }
    return masked;
  };
}
