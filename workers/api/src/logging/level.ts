type DebugLevel = 0 | 1 | 2;
export type DebugThreshold = Exclude<DebugLevel, 0>;

const MAX_LEVEL = 2;

let current: DebugLevel = 0;
let appliedRaw: string | undefined;

export function applyDebugLevel(raw: string | undefined): void {
  if (raw === appliedRaw) return;
  appliedRaw = raw;
  const parsed = Math.trunc(Number(raw));
  current = (Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), MAX_LEVEL) : 0) as DebugLevel;
}

export const isDebugEnabled = (threshold: DebugThreshold): boolean => current >= threshold;
