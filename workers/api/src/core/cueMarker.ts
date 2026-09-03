export const CUE_MARKER_PATTERN = /\u27e6c(\d+(?:\.\d+)?)\u27e7/gi;
export const cueMarkerTag = (markerId: string | number) => `\u27e6c${markerId}\u27e7`;

export function cueIdOfMarker(markerId: string): number {
  return Number(markerId.split(".")[0]);
}

export function compareMarkerIds(a: string, b: string): number {
  const [aCue, aSub] = a.split(".").map(Number);
  const [bCue, bSub] = b.split(".").map(Number);
  return aCue - bCue || (aSub || 0) - (bSub || 0);
}

export function assignMarkerIds<T extends { id: number; boundary: unknown; marker_id?: string }>(
  spans: T[],
  markerBoundary: unknown
): void {
  const markedByCue = new Map<number, number[]>();
  spans.forEach((span, i) => {
    if (span.boundary !== markerBoundary) return;
    if (!markedByCue.has(span.id)) markedByCue.set(span.id, []);
    markedByCue.get(span.id)!.push(i);
  });
  for (const indices of markedByCue.values()) {
    const needsSuffix = indices.length > 1;
    indices.forEach((idx, pos) => {
      spans[idx].marker_id = needsSuffix ? `${spans[idx].id}.${pos + 1}` : String(spans[idx].id);
    });
  }
  spans.forEach((span) => {
    if (span.marker_id === undefined) span.marker_id = String(span.id);
  });
}
