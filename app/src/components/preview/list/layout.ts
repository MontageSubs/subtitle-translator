export const SCENE_DIVIDER_HEIGHT = 30;

export interface CardLayout {
  readonly offsets: number[];
  readonly totalHeight: number;
  rebuild(heights: number[], sceneStarts: boolean[]): void;
  indexAt(offset: number): number;
  cardTop(index: number, sceneStart: boolean): number;
  cardHeight(index: number, sceneStart: boolean): number;
  grow(index: number, delta: number): void;
}

export function createCardLayout(): CardLayout {
  let offsets: number[] = [0];

  return {
    get offsets() { return offsets; },
    get totalHeight() { return offsets[offsets.length - 1] || 1; },
    rebuild(heights, sceneStarts) {
      offsets = [0];
      heights.forEach((height, index) => {
        offsets.push(offsets[index] + height + (sceneStarts[index] ? SCENE_DIVIDER_HEIGHT : 0));
      });
    },
    indexAt(target) {
      let low = 0;
      let high = offsets.length - 1;
      while (low < high) {
        const mid = (low + high) >> 1;
        if (offsets[mid + 1] < target) low = mid + 1;
        else high = mid;
      }
      return low;
    },
    cardTop: (index, sceneStart) => offsets[index] + (sceneStart ? SCENE_DIVIDER_HEIGHT : 0),
    cardHeight: (index, sceneStart) => offsets[index + 1] - offsets[index] - (sceneStart ? SCENE_DIVIDER_HEIGHT : 0),
    grow(index, delta) {
      for (let i = index + 1; i < offsets.length; i++) offsets[i] += delta;
    },
  };
}
