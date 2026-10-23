import { isBracketClose, isBracketOpen } from "../extract/edges";
import type { ProtectedSpan } from "./types";

const BRACKET_PRESENT_PATTERN = /[(\[{（［｛〔〖〘〚〈《【⟨⟪)\]}）］｝〕〗〙〛〉》】⟩⟫]/;
const BRACKET_PAIR_PATTERN = /（[^（）]{0,38}）|\([^()]{0,38}\)|【[^【】]{0,38}】|\[[^\[\]]{0,38}\]|〔[^〔〕]{0,38}〕/g;

export interface BracketProfile {
  readonly count: number;
  readonly crossing: boolean;
}

const NO_BRACKETS: BracketProfile = { count: 0, crossing: false };

export const hasBrackets = (text: string): boolean => BRACKET_PRESENT_PATTERN.test(text);

export function bracketProfile(text: string): BracketProfile {
  if (!hasBrackets(text)) return NO_BRACKETS;
  let depth = 0;
  let count = 0;
  let crossing = false;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (isBracketOpen(code)) {
      count++;
      depth++;
    } else if (isBracketClose(code)) {
      count++;
      if (--depth < 0) {
        crossing = true;
        depth = 0;
      }
    }
  }
  return { count, crossing: crossing || depth !== 0 };
}

export function findBracketPairs(text: string): ProtectedSpan[] {
  return Array.from(text.matchAll(BRACKET_PAIR_PATTERN), (match): ProtectedSpan => [match.index!, match.index! + match[0].length]);
}

export function bracketEdges(text: string): number[] {
  const edges: number[] = [];
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (isBracketOpen(code)) edges.push(index);
    else if (isBracketClose(code)) edges.push(index + 1);
  }
  return edges;
}
