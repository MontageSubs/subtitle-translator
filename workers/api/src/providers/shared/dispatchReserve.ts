export const INITIAL_DISPATCH_RESERVE_RATIO = 0.65;

export function reserveInitialDispatch<T>(
  segments: T[],
  subrequestLimit: number,
  onTruncate: (kept: number, total: number) => void
): T[] {
  const cap = Math.max(1, Math.floor(subrequestLimit * INITIAL_DISPATCH_RESERVE_RATIO));
  if (segments.length <= cap) return segments;
  onTruncate(cap, segments.length);
  return segments.slice(0, cap);
}
