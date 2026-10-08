export const STANDBY_TTL_MS = 15_000;
export const ACTIVE_TTL_MS = 20_000;

const HARD_WALLCLOCK_MS = 15_000;
const RESPONSE_OVERHEAD_MARGIN_MS = 2_000;
const MIN_FANOUT_BUDGET_MS = 3_000;

export function remainingBudgetMs(startedAt: number): number {
  return Math.max(MIN_FANOUT_BUDGET_MS, HARD_WALLCLOCK_MS - RESPONSE_OVERHEAD_MARGIN_MS - (Date.now() - startedAt));
}
