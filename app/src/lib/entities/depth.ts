export const DEPTH_LEVELS = 5;
export const DEFAULT_DEPTH = 2;
export const MODELLESS_DEPTH = 0;

interface ScanPlan {
  singleMentionShare: number;
  audit: boolean;
}

const SCAN_PLANS: readonly ScanPlan[] = [
  { singleMentionShare: 0, audit: false },
  { singleMentionShare: 0.05, audit: true },
  { singleMentionShare: 0.1, audit: true },
  { singleMentionShare: 0.15, audit: true },
];

export const clampDepth = (depth: number): number => Math.min(DEPTH_LEVELS - 1, Math.max(MODELLESS_DEPTH, Math.round(Number.isFinite(depth) ? depth : DEFAULT_DEPTH)));

export const scanPlanFor = (depth: number): ScanPlan => SCAN_PLANS[Math.min(SCAN_PLANS.length, Math.max(1, clampDepth(depth))) - 1];
