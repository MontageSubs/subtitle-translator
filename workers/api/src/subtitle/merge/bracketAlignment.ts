import { bracketEdges, bracketProfile, hasBrackets, type BracketProfile } from "./brackets";
import { insideProtectedSpan } from "./protectedSpans";
import type { ProtectedSpan } from "./types";

const MISSING_BRACKET_COST = 1;
const EXTRA_BRACKET_COST = 0.5;
const UNBALANCED_COST = 0.5;
const MISMATCH_WEIGHT = 0.25;

function mismatch(part: string, source: BracketProfile): number {
  const target = bracketProfile(part);
  const presence = (source.count > 0) === (target.count > 0) ? 0 : source.count > 0 ? MISSING_BRACKET_COST : EXTRA_BRACKET_COST;
  return presence + (source.crossing === target.crossing ? 0 : UNBALANCED_COST);
}

export function alignCutsToBrackets(
  text: string, sourceTexts: readonly string[], cuts: readonly number[], locked: ReadonlySet<number>, protectedSpans: readonly ProtectedSpan[]
): number[] {
  if (!hasBrackets(text)) return [...cuts];
  const sources = sourceTexts.map(bracketProfile);
  if (sources.every((profile) => profile.count === 0)) return [...cuts];
  const edges = bracketEdges(text);
  const aligned = [...cuts];
  for (let i = 0; i < cuts.length; i++) {
    if (locked.has(i)) continue;
    const low = i === 0 ? 0 : aligned[i - 1]!;
    const high = i === cuts.length - 1 ? text.length : aligned[i + 1]!;
    const scale = Math.max(1, high - low);
    const costAt = (position: number): number =>
      Math.abs(position - cuts[i]!) / scale + MISMATCH_WEIGHT * (mismatch(text.slice(low, position), sources[i]!) + mismatch(text.slice(position, high), sources[i + 1]!));
    let best = aligned[i]!;
    let bestCost = costAt(best);
    for (const edge of edges) {
      if (edge <= low || edge >= high || edge === best || insideProtectedSpan(edge, protectedSpans)) continue;
      const cost = costAt(edge);
      if (cost < bestCost) [best, bestCost] = [edge, cost];
    }
    aligned[i] = best;
  }
  return aligned;
}
