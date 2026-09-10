export type AnCorner = 1 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type AnCornerOrDefault = AnCorner | 2;

export interface TopAlign {
  an: AnCorner;
  vttSettings?: string;
}

const AN_TAG_PATTERN = /\{\\an([1-9])\}|\\an([1-9])\b/i;
const VTT_LINE_PATTERN = /\bline:(-?\d+(?:\.\d+)?)%?/i;
const VTT_POSITION_PATTERN = /\bposition:(\d+(?:\.\d+)?)%/i;
const VTT_ALIGN_PATTERN = /\balign:(start|left|center|middle|right|end)\b/i;

export const CORNER_VTT_SETTINGS: Record<AnCornerOrDefault, string> = {
  1: "position:20%",
  2: "",
  3: "position:80%",
  4: "position:20% line:50%",
  5: "line:50%",
  6: "position:80% line:50%",
  7: "position:20% line:20%",
  8: "line:20%",
  9: "position:80% line:20%",
};

export const AUTO_TOP_ALIGN: TopAlign = { an: 7, vttSettings: CORNER_VTT_SETTINGS[7] };

export function parseAnTag(text: string): TopAlign | undefined {
  const match = AN_TAG_PATTERN.exec(text || "");
  if (!match) return undefined;
  const an = Number(match[1] ?? match[2]);
  return an === 2 ? undefined : { an: an as AnCorner };
}

function rowFromLine(line: string | undefined): 1 | 2 | 3 {
  if (line === undefined) return 3;
  const pct = Number(line);
  if (pct <= 35) return 1;
  if (pct >= 65) return 3;
  return 2;
}

function colFromPosition(position: string | undefined, align: string | undefined): 1 | 2 | 3 {
  if (position !== undefined) {
    const pct = Number(position);
    if (pct < 40) return 1;
    if (pct > 60) return 3;
    return 2;
  }
  if (align === "start" || align === "left") return 1;
  if (align === "end" || align === "right") return 3;
  return 2;
}

const CORNER_GRID: Record<1 | 2 | 3, Record<1 | 2 | 3, AnCornerOrDefault>> = {
  1: { 1: 7, 2: 8, 3: 9 },
  2: { 1: 4, 2: 5, 3: 6 },
  3: { 1: 1, 2: 2, 3: 3 },
};

function cornerFromVttSettings(settings: string): AnCornerOrDefault {
  const row = rowFromLine(VTT_LINE_PATTERN.exec(settings)?.[1]);
  const col = colFromPosition(VTT_POSITION_PATTERN.exec(settings)?.[1], VTT_ALIGN_PATTERN.exec(settings)?.[1]?.toLowerCase());
  return CORNER_GRID[row][col];
}

export function parseVttTopAlign(cueSettings: string | undefined, text: string): TopAlign | undefined {
  if (cueSettings && (VTT_LINE_PATTERN.test(cueSettings) || VTT_POSITION_PATTERN.test(cueSettings))) {
    const an = cornerFromVttSettings(cueSettings);
    if (an !== 2) return { an, vttSettings: cueSettings.trim() };
    return undefined;
  }
  return parseAnTag(text);
}

export function resolveTopAlign(
  original: { topAlign?: TopAlign } | undefined, isMusic: boolean | undefined, autoTopAlign: boolean, override?: AnCornerOrDefault
): TopAlign | undefined {
  if (override !== undefined) return override === 2 ? undefined : { an: override };
  if (original?.topAlign) return original.topAlign;
  if (autoTopAlign && isMusic) return AUTO_TOP_ALIGN;
  return undefined;
}

export function renderAnTag(topAlign: TopAlign | undefined): string {
  return topAlign ? `{\\an${topAlign.an}}` : "";
}

export function renderVttSettings(topAlign: TopAlign | undefined): string {
  if (!topAlign) return "";
  const settings = topAlign.vttSettings || CORNER_VTT_SETTINGS[topAlign.an];
  return settings ? ` ${settings}` : "";
}
