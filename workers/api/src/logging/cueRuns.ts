const MAX_RUNS = 16;

export const describeCueSet = (ids: readonly number[]): string => (ids.length ? `${new Set(ids).size}(${formatCueRuns(ids)})` : "0");

export function formatCueRuns(ids: readonly number[]): string {
  const sorted = [...new Set(ids)].sort((a, b) => a - b);
  const runs: string[] = [];
  for (let start = 0; start < sorted.length; ) {
    let end = start;
    while (sorted[end + 1] === sorted[end]! + 1) end++;
    runs.push(end === start ? `${sorted[start]}` : `${sorted[start]}-${sorted[end]}`);
    start = end + 1;
  }
  return runs.length > MAX_RUNS ? `${runs.slice(0, MAX_RUNS).join(",")},+${runs.length - MAX_RUNS}` : runs.join(",");
}
