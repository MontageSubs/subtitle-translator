import { LEFT_CUT_PATTERN, collectMatchEnds } from "./boundaries";
import { isLeadingPunctRun } from "./characters";
import { insideProtectedSpan } from "./protectedSpans";
import type { ProtectedSpan } from "./types";

function firstIndexAfter(sorted: readonly number[], value: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid]! <= value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function firstIndexFrom(sorted: readonly number[], value: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid]! < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export class CandidateIndex {
  private readonly endsByPattern = new Map<RegExp, number[]>();
  private leftCuts: number[] | undefined;

  constructor(
    readonly text: string,
    readonly protectedSpans: readonly ProtectedSpan[]
  ) {}

  ends(pattern: RegExp): readonly number[] {
    let ends = this.endsByPattern.get(pattern);
    if (!ends) {
      ends = collectMatchEnds(
        pattern, this.text, (end, start) => !insideProtectedSpan(end, this.protectedSpans) && !isLeadingPunctRun(this.text, start)
      );
      this.endsByPattern.set(pattern, ends);
    }
    return ends;
  }

  endsBetween(pattern: RegExp, lower: number, upper: number): number[] {
    const ends = this.ends(pattern);
    return ends.slice(firstIndexAfter(ends, lower), firstIndexFrom(ends, upper));
  }

  leftCutsBetween(lower: number, upper: number): number[] {
    if (!this.leftCuts) {
      this.leftCuts = [];
      LEFT_CUT_PATTERN.lastIndex = 0;
      for (let match = LEFT_CUT_PATTERN.exec(this.text); match; match = LEFT_CUT_PATTERN.exec(this.text)) {
        if (!insideProtectedSpan(match.index, this.protectedSpans)) this.leftCuts.push(match.index);
      }
    }
    return this.leftCuts.slice(firstIndexAfter(this.leftCuts, lower), firstIndexFrom(this.leftCuts, upper));
  }
}
