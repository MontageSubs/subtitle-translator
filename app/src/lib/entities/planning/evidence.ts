import type { LedgerEntry } from "./ledger";

export interface KeyEvidence {
  probes: number;
  entity: number;
  plain: number;
  type: string | null;
}

export type EvidenceSnapshot = [string, KeyEvidence][];

export interface EvidenceStore {
  of(key: string): KeyEvidence;
  record(key: string, entity: boolean, type: string | null): void;
  snapshot(): EvidenceSnapshot;
}

const MIN_FREQUENCY_FOR_CONFIRMATION = 6;
const MAX_PROBES = 4;
const MULTI_PROBE_TYPES: ReadonlySet<string> = new Set(["LOC", "ORG"]);
const EMPTY: KeyEvidence = { probes: 0, entity: 0, plain: 0, type: null };

export function createEvidenceStore(restored?: EvidenceSnapshot): EvidenceStore {
  const table = new Map<string, KeyEvidence>(restored);
  return {
    of: (key) => table.get(key) ?? EMPTY,
    record(key, entity, type) {
      const current = table.get(key) ?? { probes: 0, entity: 0, plain: 0, type: null };
      current.probes += 1;
      if (entity) {
        current.entity += 1;
        current.type ??= type;
      } else current.plain += 1;
      table.set(key, current);
    },
    snapshot: () => [...table].map(([key, value]) => [key, { ...value }]),
  };
}

function quotaFor(entry: LedgerEntry, evidence: KeyEvidence, groupCount: number): number {
  let quota = 1;
  const strongPlain = entry.frequency >= MIN_FREQUENCY_FOR_CONFIRMATION && entry.midCapital > 0 && entry.lowercase === 0;
  if (evidence.entity > 0) {
    if (entry.frequency >= MIN_FREQUENCY_FOR_CONFIRMATION || (evidence.type !== null && MULTI_PROBE_TYPES.has(evidence.type))) quota = 2;
    if (evidence.plain > 0) quota = Math.min(MAX_PROBES, 2 + evidence.plain);
  } else if (evidence.plain > 0 && strongPlain) quota = 2;
  return Math.min(quota, groupCount, MAX_PROBES);
}

export const remainingNeed = (entry: LedgerEntry, evidence: KeyEvidence): number => Math.max(0, quotaFor(entry, evidence, entry.groups.length) - evidence.probes);
