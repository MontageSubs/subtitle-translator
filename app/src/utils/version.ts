export type VersionParts = readonly [number, number, number, number];

const VERSION_PATTERN = /^(\d{1,9})(?:\.(\d{1,9}))?(?:\.(\d{1,9}))?(?:\.(\d{1,9}))?(?:[-+][0-9A-Za-z.+-]{0,31})?$/;
const MAX_VERSION_LENGTH = 48;
const UNKNOWN_VERSION: VersionParts = [0, 0, 0, 0];

export function parseVersion(raw: unknown): VersionParts | null {
  if (typeof raw !== "string" || raw.length > MAX_VERSION_LENGTH) return null;
  const match = VERSION_PATTERN.exec(raw);
  return match && [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0), Number(match[4] ?? 0)];
}

export function compareVersions(a: VersionParts, b: VersionParts): number {
  for (let index = 0; index < 4; index++) {
    const difference = a[index]! - b[index]!;
    if (difference) return difference;
  }
  return 0;
}

export function isVersionAtLeast(version: unknown, minimum: unknown): boolean {
  const required = parseVersion(minimum);
  return !required || compareVersions(parseVersion(version) ?? UNKNOWN_VERSION, required) >= 0;
}
