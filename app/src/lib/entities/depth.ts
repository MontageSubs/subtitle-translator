export const DEPTH_LEVELS = 7;
export const DEFAULT_DEPTH = 3;
export const MODELLESS_DEPTH = 0;
export const SEQUENTIAL_DEPTH = DEPTH_LEVELS - 1;

interface ScanPlan {
  singleMentionShare: number;
  auditShare: number;
  confirmations: number;
}

const SCAN_PLANS: readonly ScanPlan[] = [
  { singleMentionShare: 0, auditShare: 0, confirmations: 1 },
  { singleMentionShare: 0.25, auditShare: 0.01, confirmations: 1 },
  { singleMentionShare: 0.5, auditShare: 0.015, confirmations: 1 },
  { singleMentionShare: 0.75, auditShare: 0.03, confirmations: 2 },
  { singleMentionShare: 1, auditShare: 0.06, confirmations: 2 },
];

export const clampDepth = (depth: number): number => Math.min(SEQUENTIAL_DEPTH, Math.max(MODELLESS_DEPTH, Math.round(Number.isFinite(depth) ? depth : DEFAULT_DEPTH)));

export const isSequentialDepth = (depth: number): boolean => clampDepth(depth) === SEQUENTIAL_DEPTH;

export const sharesStrategy = (left: number, right: number): boolean => isSequentialDepth(left) === isSequentialDepth(right) && (clampDepth(left) === MODELLESS_DEPTH) === (clampDepth(right) === MODELLESS_DEPTH);

export const scanPlanFor = (depth: number): ScanPlan => SCAN_PLANS[Math.min(SCAN_PLANS.length, Math.max(1, clampDepth(depth))) - 1];
