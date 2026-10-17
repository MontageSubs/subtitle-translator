import type { RequestContext } from "./context";
import { clientOutdated } from "./responses";
import { MIN_CLIENT_VERSION } from "../version";

const VERSION_PATTERN = /^(\d{1,9})(?:\.(\d{1,9}))?(?:\.(\d{1,9}))?(?:\.(\d{1,9}))?(?:[-+][0-9A-Za-z.+-]{0,31})?$/;
const MAX_VERSION_LENGTH = 48;
const PART_COUNT = 4;

const isVersionLabel = (raw: unknown): raw is string => typeof raw === "string" && raw.length <= MAX_VERSION_LENGTH && VERSION_PATTERN.test(raw);

const partOf = (match: RegExpExecArray | null, index: number): number => Number(match?.[index + 1] ?? 0);

const MINIMUM_MATCH = isVersionLabel(MIN_CLIENT_VERSION) ? VERSION_PATTERN.exec(MIN_CLIENT_VERSION) : null;
const MINIMUM = Array.from({ length: PART_COUNT }, (_, index) => partOf(MINIMUM_MATCH, index));
const IS_ENFORCED = MINIMUM.some(Boolean);

function isBelowMinimum(match: RegExpExecArray | null): boolean {
  for (let index = 0; index < PART_COUNT; index++) {
    const difference = partOf(match, index) - MINIMUM[index]!;
    if (difference) return difference < 0;
  }
  return false;
}

export function noteClientVersion(rc: RequestContext, raw: unknown): void {
  if (isVersionLabel(raw)) rc.clientVersion = raw;
}

export function rejectOutdatedClient(rc: RequestContext, raw: unknown, ipHash?: string): Response | null {
  if (!IS_ENFORCED) {
    noteClientVersion(rc, raw);
    return null;
  }
  const match = typeof raw === "string" && raw.length <= MAX_VERSION_LENGTH ? VERSION_PATTERN.exec(raw) : null;
  if (match) rc.clientVersion = match[0];
  return isBelowMinimum(match) ? clientOutdated(rc, MIN_CLIENT_VERSION, ipHash) : null;
}
