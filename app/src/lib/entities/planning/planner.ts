import type { Ledger } from "./ledger";

export type NeedOf = (key: string) => number;

const ROUND_SHARE = 0.04;
const MIN_ROUND_SIZE = 20;

export const roundSizeFor = (groupCount: number): number => Math.max(MIN_ROUND_SIZE, Math.ceil(groupCount * ROUND_SHARE));

interface HeapItem {
  gain: number;
  group: number;
}

const outranks = (left: HeapItem, right: HeapItem): boolean => left.gain > right.gain || (left.gain === right.gain && left.group < right.group);

class MaxHeap {
  private readonly items: HeapItem[] = [];

  get size(): number {
    return this.items.length;
  }

  push(item: HeapItem): void {
    const { items } = this;
    items.push(item);
    for (let child = items.length - 1; child > 0; ) {
      const parent = (child - 1) >> 1;
      if (!outranks(items[child], items[parent])) break;
      [items[child], items[parent]] = [items[parent], items[child]];
      child = parent;
    }
  }

  pop(): HeapItem {
    const { items } = this;
    const top = items[0];
    const last = items.pop()!;
    if (items.length) {
      items[0] = last;
      for (let parent = 0; ; ) {
        const left = parent * 2 + 1;
        const right = left + 1;
        let best = parent;
        if (left < items.length && outranks(items[left], items[best])) best = left;
        if (right < items.length && outranks(items[right], items[best])) best = right;
        if (best === parent) break;
        [items[parent], items[best]] = [items[best], items[parent]];
        parent = best;
      }
    }
    return top;
  }
}

export function totalNeed(keys: Iterable<string>, needOf: NeedOf): number {
  let total = 0;
  for (const key of keys) total += needOf(key);
  return total;
}

export function selectRound(ledger: Ledger, keysOf: readonly (readonly string[])[], probed: ReadonlySet<number>, needOf: NeedOf, limit: number): number[] {
  const tally = new Map<string, number>();
  const gainOf = (group: number): number => {
    let gain = 0;
    for (const key of keysOf[group]) if (needOf(key) - (tally.get(key) ?? 0) > 0) gain += 1;
    return gain;
  };
  const heap = new MaxHeap();
  for (let group = 0; group < ledger.groups.length; group++) {
    if (probed.has(group) || !keysOf[group].length) continue;
    const gain = gainOf(group);
    if (gain > 0) heap.push({ gain, group });
  }
  const chosen: number[] = [];
  while (chosen.length < limit && heap.size) {
    const top = heap.pop();
    const fresh = gainOf(top.group);
    if (fresh === 0) continue;
    if (fresh < top.gain) {
      heap.push({ gain: fresh, group: top.group });
      continue;
    }
    chosen.push(top.group);
    for (const key of keysOf[top.group]) tally.set(key, (tally.get(key) ?? 0) + 1);
  }
  return chosen;
}
