import { Cue } from '../types';

const META_KEYS = ["topAlign", "cueSettings", "identifier", "vttHeader", "assHeader", "assTags", "leadingBlocks", "trailingBlocks"] as const;

export type CueMeta = Partial<Pick<Cue, (typeof META_KEYS)[number]>>;

export function applyCueMeta<T extends { id: number; start_ms: number; end_ms: number }>(base: T, meta: CueMeta | undefined): T & CueMeta {
  return meta ? { ...base, ...meta } : base;
}
