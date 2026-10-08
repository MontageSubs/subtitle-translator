const INITIAL_DISPATCH_RESERVE_RATIO = 0.65;

export const SUBREQUEST_LIMIT = 35;

export class SubrequestBudget {
  private used = 0;
  private tripped = false;

  constructor(private readonly limit: number, private readonly onExhausted: () => void) {}

  get exhausted(): boolean {
    return this.tripped;
  }

  consume(): void {
    if (this.used >= this.limit) {
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
  const cap = Math.max(1, Math.floor(limit * INITIAL_DISPATCH_RESERVE_RATIO));
  if (segments.length <= cap) return segments;
  onTruncate(cap, segments.length);
  return segments.slice(0, cap);
}
