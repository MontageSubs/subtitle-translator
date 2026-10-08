import { Cue } from '../types';

const META_KEYS = ["topAlign", "cueSettings", "identifier", "vttHeader", "assHeader", "leadingBlocks", "trailingBlocks"] as const;

export type CueMeta = Partial<Pick<Cue, (typeof META_KEYS)[number]>>;

export function extractCueMeta(cue: Cue | undefined): CueMeta | undefined {
  if (!cue) return undefined;
  const entries = META_KEYS.filter((key) => cue[key] !== undefined).map((key) => [key, cue[key]]);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

export function applyCueMeta<T extends { id: number; start_ms: number; end_ms: number }>(base: T, meta: CueMeta | undefined): T & CueMeta {
  return meta ? { ...base, ...meta } : base;
}
