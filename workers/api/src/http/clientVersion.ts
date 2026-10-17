import { MIN_CLIENT_VERSION } from "../config/compat";
import type { RequestContext } from "./context";
import { clientOutdated } from "./responses";

const VERSION_PATTERN = /^(\d{1,9})(?:\.(\d{1,9}))?(?:\.(\d{1,9}))?(?:\.(\d{1,9}))?(?:[-+][0-9A-Za-z.+-]{0,31})?$/;
const MAX_VERSION_LENGTH = 48;
const PART_COUNT = 4;

const matchVersion = (raw: unknown): RegExpExecArray | null => (typeof raw === "string" && raw.length <= MAX_VERSION_LENGTH ? VERSION_PATTERN.exec(raw) : null);

const partOf = (match: RegExpExecArray | null, index: number): number => Number(match?.[index + 1] ?? 0);

const MINIMUM_MATCH = matchVersion(MIN_CLIENT_VERSION);
const MINIMUM = Array.from({ length: PART_COUNT }, (_, index) => partOf(MINIMUM_MATCH, index));

function isBelowMinimum(match: RegExpExecArray | null): boolean {
  for (let index = 0; index < PART_COUNT; index++) {
    const difference = partOf(match, index) - MINIMUM[index]!;
    if (difference) return difference < 0;
  }
  return false;
}

export function noteClientVersion(rc: RequestContext, raw: unknown): void {
  if (matchVersion(raw)) rc.clientVersion = String(raw);
}

export function rejectOutdatedClient(rc: RequestContext, raw: unknown, ipHash?: string): Response | null {
  const match = matchVersion(raw);
  if (match) rc.clientVersion = String(raw);
  return isBelowMinimum(match) ? clientOutdated(rc, MIN_CLIENT_VERSION, ipHash) : null;
}
