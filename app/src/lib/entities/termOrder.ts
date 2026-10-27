const WHITESPACE_PATTERN = /\s+/g;
const UNSPACED_SCRIPT_PATTERN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

const fold = (text: string): string => text.normalize("NFKC").replace(WHITESPACE_PATTERN, " ").trim().toLowerCase();

function contains(longer: string, shorter: string): boolean {
  if (longer === shorter) return false;
  return UNSPACED_SCRIPT_PATTERN.test(shorter) ? longer.includes(shorter) : ` ${longer} `.includes(` ${shorter} `);
}

export function orderRelatedTerms<T>(items: readonly T[], sourceOf: (item: T) => string): T[] {
  const keys = items.map((item) => fold(sourceOf(item)));
  const parent = items.map((_, index) => index);
  const root = (index: number): number => (parent[index] === index ? index : (parent[index] = root(parent[index])));
  keys.forEach((left, i) => keys.forEach((right, j) => {
    if (i < j && (contains(left, right) || contains(right, left))) parent[root(i)] = root(j);
  }));
  const clusters = new Map<number, number[]>();
  items.forEach((_, index) => clusters.set(root(index), [...(clusters.get(root(index)) ?? []), index]));
  const ranked = [...clusters.values()].map((members) => members.sort((a, b) => keys[b].length - keys[a].length || keys[a].localeCompare(keys[b])));
  ranked.sort((left, right) => keys[left[0]].localeCompare(keys[right[0]]));
  return ranked.flat().map((index) => items[index]);
}
