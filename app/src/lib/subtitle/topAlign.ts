export type AnCorner = 7 | 8 | 9;

export interface TopAlign {
  an: AnCorner;
  vttSettings?: string;
}

const AN_TAG_PATTERN = /\{\\an([789])\}|\\an([789])\b/i;
const VTT_LINE_PATTERN = /\bline:(-?\d+(?:\.\d+)?)%?/i;
const VTT_POSITION_PATTERN = /\bposition:(\d+(?:\.\d+)?)%/i;
const VTT_ALIGN_PATTERN = /\balign:(start|left|center|middle|right|end)\b/i;
const CORNER_POSITION_PERCENT: Record<AnCorner, number> = { 7: 10, 8: 50, 9: 90 };

export const AUTO_TOP_ALIGN: TopAlign = { an: 7, vttSettings: "position:20% line:20%" };

export function parseAnTag(text: string): TopAlign | undefined {
  const match = AN_TAG_PATTERN.exec(text || "");
  if (!match) return undefined;
  return { an: Number(match[1] ?? match[2]) as AnCorner };
}

function cornerFromVttSettings(settings: string): AnCorner {
  const position = VTT_POSITION_PATTERN.exec(settings);
  if (position) {
    const pct = Number(position[1]);
    return pct < 40 ? 7 : pct > 60 ? 9 : 8;
  }
  const align = VTT_ALIGN_PATTERN.exec(settings)?.[1]?.toLowerCase();
  if (align === "start" || align === "left") return 7;
  if (align === "end" || align === "right") return 9;
  return 8;
}

export function parseVttTopAlign(cueSettings: string | undefined, text: string): TopAlign | undefined {
  if (cueSettings) {
    const line = VTT_LINE_PATTERN.exec(cueSettings);
    if (line && Number(line[1]) <= 30) {
      return { an: cornerFromVttSettings(cueSettings), vttSettings: cueSettings.trim() };
    }
  }
  return parseAnTag(text);
}

export function resolveTopAlign(
  original: { topAlign?: TopAlign } | undefined, isMusic: boolean | undefined, autoTopAlign: boolean
): TopAlign | undefined {
  if (original?.topAlign) return original.topAlign;
  if (autoTopAlign && isMusic) return AUTO_TOP_ALIGN;
  return undefined;
}

export function renderAnTag(topAlign: TopAlign | undefined): string {
  return topAlign ? `{\\an${topAlign.an}}` : "";
}

export function renderVttSettings(topAlign: TopAlign | undefined): string {
  if (!topAlign) return "";
  if (topAlign.vttSettings) return ` ${topAlign.vttSettings}`;
  return ` position:${CORNER_POSITION_PERCENT[topAlign.an]}% line:20%`;
}
