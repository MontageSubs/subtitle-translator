export interface PackableItem {
  id: number;
}

export interface ChapterPacking<T> {
  batches: T[][][];
  oversized: T[];
}

export function packChapters<T extends PackableItem>(
  items: readonly T[], chapterGroups: readonly number[][], limit: number, itemCost: (item: T) => number, groupOverhead: number
): ChapterPacking<T> {
  const byId = new Map(items.map((item) => [item.id, item]));
  const batches: T[][][] = [];
  const oversized: T[] = [];
  let current: T[][] = [];
  let currentCost = 0;

  const flush = () => {
    if (current.length) batches.push(current);
    current = [];
    currentCost = 0;
  };

  const splitOversizedGroup = (group: T[]) => {
    let piece: T[] = [];
    let pieceCost = groupOverhead;
    for (const item of group) {
      const cost = itemCost(item);
      if (groupOverhead + cost > limit) {
        oversized.push(item);
        continue;
      }
      if (piece.length && pieceCost + cost > limit) {
        batches.push([piece]);
        piece = [];
        pieceCost = groupOverhead;
      }
      piece.push(item);
      pieceCost += cost;
    }
    if (piece.length) batches.push([piece]);
  };

  for (const ids of chapterGroups) {
    const group = ids.flatMap((id) => byId.get(id) ?? []);
    if (!group.length) continue;
    const groupCost = groupOverhead + group.reduce((sum, item) => sum + itemCost(item), 0);
    if (groupCost > limit) {
      flush();
      splitOversizedGroup(group);
    } else if (currentCost + groupCost > limit) {
      flush();
      current = [group];
      currentCost = groupCost;
    } else {
      current.push(group);
      currentCost += groupCost;
    }
  }
  flush();
  return { batches, oversized };
}

export function groupUnitsByChapter(unitIds: readonly number[], chapterOf: ReadonlyMap<number, number>): number[][] {
  const groups = new Map<number, number[]>();
  for (const id of unitIds) {
    const chapterId = chapterOf.get(id) ?? 0;
    const group = groups.get(chapterId);
    if (group) group.push(id);
    else groups.set(chapterId, [id]);
  }
  return [...groups.values()];
}
