export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function countMatchesUpTo(pattern: RegExp, text: string, limit: number): number {
  pattern.lastIndex = 0;
  let count = 0;
  while (count < limit && pattern.exec(text) !== null) count++;
  return count;
}
