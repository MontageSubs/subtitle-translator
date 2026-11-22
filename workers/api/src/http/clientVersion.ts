import type { RequestContext } from "./context";
import { MIN_CLIENT_VERSION } from "../version";

const VERSION_PATTERN = /^(\d{1,9})(?:\.(\d{1,9}))?(?:\.(\d{1,9}))?(?:\.(\d{1,9}))?(?:-([0-9A-Za-z.-]{1,31}))?(?:\+[0-9A-Za-z.+-]{0,31})?$/;
const MAX_VERSION_LENGTH = 48;
const PART_COUNT = 4;

let rememberedRaw: unknown;
let rememberedMatch: RegExpExecArray | null = null;

function matchLabel(raw: unknown): RegExpExecArray | null {
  if (raw === rememberedRaw) return rememberedMatch;
  rememberedRaw = raw;
  rememberedMatch = typeof raw === "string" && raw.length <= MAX_VERSION_LENGTH ? VERSION_PATTERN.exec(raw) : null;
  return rememberedMatch;
}

const partOf = (match: RegExpExecArray | null, index: number): number => Number(match?.[index + 1] ?? 0);

const MINIMUM_MATCH = matchLabel(MIN_CLIENT_VERSION);
const MINIMUM = Array.from({ length: PART_COUNT }, (_, index) => partOf(MINIMUM_MATCH, index));
const MINIMUM_PRERELEASE = MINIMUM_MATCH?.[PART_COUNT + 1] ?? "";
const IS_ENFORCED = MINIMUM.some(Boolean) || MINIMUM_PRERELEASE !== "";

function isBelowMinimum(match: RegExpExecArray): boolean {
  for (let index = 0; index < PART_COUNT; index++) {
    const difference = partOf(match, index) - MINIMUM[index]!;
    if (difference) return difference < 0;
  }
  const prerelease = match[PART_COUNT + 1] ?? "";
  if (prerelease === MINIMUM_PRERELEASE) return false;
  if (!prerelease) return false;
  if (!MINIMUM_PRERELEASE) return true;
  return prerelease.localeCompare(MINIMUM_PRERELEASE, "en", { numeric: true }) < 0;
}

export function numericPartsOf(label: string): number[] | null {
  const match = matchLabel(label);
  return match ? Array.from({ length: PART_COUNT }, (_, index) => partOf(match, index)) : null;
}

export type VersionStanding = "supported" | "unsupported" | "malformed";

export function versionStanding(raw: unknown): VersionStanding {
  const match = matchLabel(raw);
  if (!match) return "malformed";
  return IS_ENFORCED && isBelowMinimum(match) ? "unsupported" : "supported";
}

export function noteClientVersion(rc: RequestContext, raw: unknown): void {
  if (!matchLabel(raw)) return;
  const label = raw as string;
  const buildMetadata = label.indexOf("+");
  rc.clientVersion = buildMetadata < 0 ? label : label.slice(0, buildMetadata);
}
