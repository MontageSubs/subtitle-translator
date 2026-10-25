export const SUBREQUEST_LIMIT = 35;
export const INITIAL_DISPATCH_RESERVE_RATIO = 0.65;
export const FINISHING_RESERVE = 3;

export const initialDispatchCap = (limit: number): number => Math.max(1, Math.floor(limit * INITIAL_DISPATCH_RESERVE_RATIO));

export class SubrequestBudget {
  private used = 0;
  private tripped = false;
  private held = 0;

  constructor(readonly limit: number, private readonly onExhausted: () => void) {
    this.holdFinishingReserve();
  }

  get exhausted(): boolean {
    return this.used >= this.limit - this.held;
  }

  get consumed(): number {
    return this.used;
  }

  holdFinishingReserve(): void {
    this.held = Math.min(FINISHING_RESERVE, this.limit - 1);
  }

  releaseFinishingReserve(): void {
    this.held = 0;
  }

  consume(): void {
    if (this.exhausted) {
      if (!this.tripped) {
        this.tripped = true;
        this.onExhausted();
      }
      throw new Error("worker subrequest budget exhausted");
    }
    this.used++;
  }
}

export function reserveInitialDispatch<T>(segments: T[], limit: number, onTruncate: (kept: number, total: number) => void): T[] {
  const cap = initialDispatchCap(limit);
  if (segments.length <= cap) return segments;
  onTruncate(cap, segments.length);
  return segments.slice(0, cap);
}
