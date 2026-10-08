export const CUE_MARKER_PATTERN = /\u27e6c(\d+(?:\.\d+)?)\u27e7/gi;
export const cueMarkerTag = (markerId: string | number) => `\u27e6c${markerId}\u27e7`;

const MARKER_WHITESPACE_PATTERN = /\u27e6\s*([a-zA-Z]{1,3})\s*(\d+(?:\.\d+)?)\s*\u27e7/g;
const VALID_CUE_MARKER_PATTERN = /\u27e6c\d+(?:\.\d+)?\u27e7/gi;
const RESIDUAL_MARKER_PATTERN = /\u27e6[^\u27e6\u27e7]*\u27e7|[\u27e6\u27e7]/g;
const CUE_MARKER_PLACEHOLDER = (index: number) => `\u0002${index}\u0002`;
const CUE_MARKER_PLACEHOLDER_PATTERN = /\u0002(\d+)\u0002/g;

export function normalizeMarkerWhitespace(text: string): string {
  return text.indexOf("\u27e6") === -1 ? text : text.replace(MARKER_WHITESPACE_PATTERN, "\u27e6$1$2\u27e7");
}

export function stripForeignMarkers(text: string): string {
  if (text.indexOf("\u27e6") === -1 && text.indexOf("\u27e7") === -1) return text;
  const preserved: string[] = [];
  const guarded = text.replace(VALID_CUE_MARKER_PATTERN, (marker) => {
    preserved.push(marker);
    return CUE_MARKER_PLACEHOLDER(preserved.length - 1);
  });
  return guarded.replace(RESIDUAL_MARKER_PATTERN, "").replace(CUE_MARKER_PLACEHOLDER_PATTERN, (_, i) => preserved[Number(i)]!);
}

export function compareMarkerIds(a: string, b: string): number {
  const [aCue, aSub] = a.split(".").map(Number);
  const [bCue, bSub] = b.split(".").map(Number);
  return aCue! - bCue! || (aSub || 0) - (bSub || 0);
}

export function assignMarkerIds<T extends { id: number; boundary: unknown; marker_id?: string }>(spans: T[], markerBoundary: unknown): void {
  const markedByCue = new Map<number, number[]>();
  spans.forEach((span, i) => {
    if (span.boundary !== markerBoundary) return;
    const indices = markedByCue.get(span.id);
    if (indices) indices.push(i);
    else markedByCue.set(span.id, [i]);
  });
  for (const indices of markedByCue.values()) {
    const needsSuffix = indices.length > 1;
    indices.forEach((index, position) => {
      spans[index]!.marker_id = needsSuffix ? `${spans[index]!.id}.${position + 1}` : String(spans[index]!.id);
    });
  }
  for (const span of spans) span.marker_id ??= String(span.id);
}
