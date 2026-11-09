interface ParsedVersion {
  parts: readonly [number, number, number, number];
  prerelease: string;
}

const VERSION_PATTERN = /^(\d{1,9})(?:\.(\d{1,9}))?(?:\.(\d{1,9}))?(?:\.(\d{1,9}))?(?:-([0-9A-Za-z.-]{1,31}))?(?:\+[0-9A-Za-z.+-]{0,31})?$/;
const MAX_VERSION_LENGTH = 48;
const UNKNOWN_VERSION: ParsedVersion = { parts: [0, 0, 0, 0], prerelease: "" };

function parseVersion(raw: unknown): ParsedVersion | null {
  if (typeof raw !== "string" || raw.length > MAX_VERSION_LENGTH) return null;
  const match = VERSION_PATTERN.exec(raw);
  return match && { parts: [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0), Number(match[4] ?? 0)], prerelease: match[5] ?? "" };
}

function compareVersions(a: ParsedVersion, b: ParsedVersion): number {
  for (let index = 0; index < 4; index++) {
    const difference = a.parts[index]! - b.parts[index]!;
    if (difference) return difference;
  }
  if (a.prerelease === b.prerelease) return 0;
  if (!a.prerelease) return 1;
  if (!b.prerelease) return -1;
  return a.prerelease.localeCompare(b.prerelease, "en", { numeric: true });
}

export const compareVersionLabels = (left: unknown, right: unknown): number =>
  Math.sign(compareVersions(parseVersion(left) ?? UNKNOWN_VERSION, parseVersion(right) ?? UNKNOWN_VERSION));

export function isVersionAtLeast(version: unknown, minimum: unknown): boolean {
  return !parseVersion(minimum) || compareVersionLabels(version, minimum) >= 0;
}
