import type { Span } from "../types";
import { CUE_MARKER_PATTERN } from "../markers";
import { BOUNDARY_SEARCH_PATTERNS, ORIGINAL_PUNCT_TOLERANCE, PUNCT_PROXIMITY_CHARS, type BoundaryName } from "./boundaries";
import type { CandidateIndex } from "./candidates";
import { bisectLeft } from "./measure";

const sum = (values: number[]): number => values.reduce((a, b) => a + b, 0);

export function resolveMarkerAnchors(text: string, spans: Span[]): Map<number, number> {
  const positions = new Map<string, number>();
  for (const m of text.matchAll(CUE_MARKER_PATTERN)) if (!positions.has(m[1]!)) positions.set(m[1]!, m.index!);
  const anchors = new Map<number, number>();
  for (let i = 0; i < spans.length - 1; i++) {
    const next = spans[i + 1]!;
    const position = next.boundary === "marker" ? positions.get(next.marker_id) : undefined;
    if (position !== undefined) anchors.set(i, position);
  }
  return anchors;
}

export function computeExpectedPositions(textLength: number, lengths: number[], prefix: ArrayLike<number>): number[] {
  const total = sum(lengths) || 1;
  const totalWeight = prefix[prefix.length - 1]!;
  let cumulative = 0;
  const expected: number[] = [];
  for (const length of lengths.slice(0, -1)) {
    cumulative += length;
    const ratio = cumulative / total;
    expected.push(
      totalWeight > 0 ? Math.max(0, Math.min(bisectLeft(prefix, totalWeight * ratio) - 1, textLength)) : textLength * ratio
    );
  }
  return expected;
}

function alignCutsToCandidates(expected: number[], order: number[], candidates: number[], toleranceOf: (k: number) => number): Map<number, number> {
  const n = order.length;
  const m = candidates.length;
  const assignment = new Map<number, number>();
  if (!n || !m) return assignment;
  const penalty = Math.max(...Array.from({ length: n }, (_, k) => toleranceOf(k))) + 1;
  const width = m + 1;
  const dp = new Float64Array((n + 1) * width);
  const tolerances = Array.from({ length: n }, (_, k) => toleranceOf(k));
  for (let i = 1; i <= n; i++) {
    const target = expected[order[i - 1]!]!;
    for (let j = 1; j <= m; j++) {
      let best = Math.max(dp[(i - 1) * width + j]!, dp[i * width + j - 1]!);
      const deviation = Math.abs(candidates[j - 1]! - target);
      if (deviation <= tolerances[i - 1]!) best = Math.max(best, dp[(i - 1) * width + j - 1]! + penalty - deviation);
      dp[i * width + j] = best;
    }
  }
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    if (dp[i * width + j] === dp[(i - 1) * width + j]) i--;
    else if (dp[i * width + j] === dp[i * width + j - 1]) j--;
    else {
      assignment.set(order[i - 1]!, candidates[j - 1]!);
      i--;
      j--;
    }
  }
  return assignment;
}

export function resolveAnchorCuts(index: CandidateIndex, boundaryTypes: (BoundaryName | null)[], expected: number[]): Map<number, number> {
  const anchors = new Map<number, number>();
  for (const boundary of new Set(boundaryTypes.filter((type): type is BoundaryName => type !== null))) {
    const order = boundaryTypes.flatMap((type, i) => (type === boundary ? [i] : []));
    const used = new Set<number>();
    for (const pattern of BOUNDARY_SEARCH_PATTERNS[boundary]) {
      const pending = order.filter((i) => !anchors.has(i));
      if (!pending.length) break;
      const candidates = index.ends(pattern).filter((end) => !used.has(end));
      const toleranceOf = (k: number) => {
        const i = pending[k]!;
        const chunk = expected[i]! - (i > 0 ? expected[i - 1]! : 0);
        return Math.max(ORIGINAL_PUNCT_TOLERANCE[boundary] * chunk, PUNCT_PROXIMITY_CHARS);
      };
      for (const [i, cut] of alignCutsToCandidates(expected, pending, candidates, toleranceOf)) {
        anchors.set(i, cut);
        used.add(cut);
      }
    }
  }
  return anchors;
}

export function refineExpectedPositions(lengths: number[], anchors: Map<number, number>, expected: number[], textLength: number): number[] {
  if (!anchors.size) return expected;
  const checkpoints = [...anchors.entries()].sort((a, b) => a[0] - b[0]);
  const bounds: [number, number][] = [[-1, 0], ...checkpoints, [expected.length, textLength]];
  const refined = [...expected];
  for (let b = 0; b < bounds.length - 1; b++) {
    const [loIdx, loPos] = bounds[b]!;
    const [hiIdx, hiPos] = bounds[b + 1]!;
    const spanTotal = sum(lengths.slice(loIdx + 1, hiIdx + 1));
    if (spanTotal <= 0) continue;
    let cumulative = 0;
    for (let i = loIdx + 1; i < hiIdx; i++) {
      cumulative += lengths[i]!;
      refined[i] = loPos + (hiPos - loPos) * (cumulative / spanTotal);
    }
  }
  return refined;
}
