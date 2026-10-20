import type { Cue } from "../subtitle/types";
import type { CueMeta } from "../subtitle/formats/cueMeta";
import { parseVttTopAlign, topAlignOf, TopAlign } from "../subtitle/formats/topAlign";
import type { HistoryCue } from "./historyTypes";

const META_KEYS = ["cueSettings", "identifier", "vttHeader", "assHeader", "assTags", "leadingBlocks", "trailingBlocks"] as const;

const topAlignFromSettings = (cueSettings: string | undefined): TopAlign | undefined => (cueSettings ? parseVttTopAlign(cueSettings, "") : undefined);

const sameTopAlign = (a: TopAlign | undefined, b: TopAlign | undefined): boolean => a?.an === b?.an && a?.vttSettings === b?.vttSettings;

const pickMeta = (source: Cue | HistoryCue): CueMeta =>
  Object.fromEntries(META_KEYS.filter((key) => source[key] !== undefined).map((key) => [key, source[key]]));

export function packCueMeta(original: Cue | undefined): Pick<HistoryCue, (typeof META_KEYS)[number] | "an"> {
  if (!original) return {};
  const meta = pickMeta(original);
  return sameTopAlign(original.topAlign, topAlignFromSettings(original.cueSettings)) ? meta : { ...meta, an: original.topAlign?.an ?? 2 };
}

export function unpackCueMeta(cue: HistoryCue): CueMeta {
  const topAlign = cue.an === undefined ? topAlignFromSettings(cue.cueSettings) : topAlignOf(cue.an);
  return topAlign ? { ...pickMeta(cue), topAlign } : pickMeta(cue);
}
