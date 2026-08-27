import { Cue } from '../../utils/types';

const META_KEYS = ["position", "identifier", "vttHeader", "leadingBlocks", "trailingBlocks"] as const;

export type CueMeta = Partial<Pick<Cue, (typeof META_KEYS)[number]>>;

export function extractCueMeta(cue: Cue | undefined): CueMeta | undefined {
  if (!cue) return undefined;
  const meta: CueMeta = {};
  for (const key of META_KEYS) {
    const value = cue[key];
    if (value !== undefined) (meta as any)[key] = value;
  }
  return Object.keys(meta).length ? meta : undefined;
}

export function applyCueMeta<T extends { id: number; start_ms: number; end_ms: number }>(
  base: T, meta: CueMeta | undefined
): T & CueMeta {
  return meta ? { ...base, ...meta } : base;
}
