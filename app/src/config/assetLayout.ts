export const ASSET_PART_TARGET_BYTES = 24 * 1024 * 1024;

export const ASSET_SITE_FILE_LIMIT = 20_000;

export const PARTS_DESCRIPTOR_SUFFIX = ".parts.json";

export interface PartDescriptor {
  path: string;
  bytes: number;
  sha256: string;
}

export interface PartsDescriptor {
  schema: 1;
  bytes: number;
  sha256: string;
  parts: PartDescriptor[];
}

const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export function planPartSizes(bytes: number): number[] {
  const count = Math.max(1, Math.ceil(bytes / ASSET_PART_TARGET_BYTES));
  const base = Math.floor(bytes / count);
  const remainder = bytes % count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
}

export const partPathOf = (name: string, index: number, count: number): string => (count === 1 ? name : `${name}.part${index}`);

export const descriptorNameOf = (name: string): string => `${name}${PARTS_DESCRIPTOR_SUFFIX}`;

export const isPartsDescriptorUrl = (url: string): boolean => url.split(/[?#]/)[0]!.endsWith(PARTS_DESCRIPTOR_SUFFIX);

const isSafePartPath = (value: unknown): value is string => typeof value === "string" && value !== "" && !value.startsWith("//") && !value.includes(":") && !value.includes("\\");

const isNonNegativeInteger = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0;

export function isPartsDescriptor(value: unknown): value is PartsDescriptor {
  if (typeof value !== "object" || value === null) return false;
  const { schema, bytes, sha256, parts } = value as Record<string, unknown>;
  if (schema !== 1 || !isNonNegativeInteger(bytes) || typeof sha256 !== "string" || !SHA256_PATTERN.test(sha256) || !Array.isArray(parts) || parts.length === 0) return false;
  const wellFormed = parts.every((part) => typeof part === "object" && part !== null && isSafePartPath(part.path) && isNonNegativeInteger(part.bytes) && typeof part.sha256 === "string" && SHA256_PATTERN.test(part.sha256));
  return wellFormed && parts.reduce((sum: number, part: PartDescriptor) => sum + part.bytes, 0) === bytes;
}
