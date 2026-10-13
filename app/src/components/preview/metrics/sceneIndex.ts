import { isMusicText } from "../../../lib/subtitle/common/charClass";
import { DEFAULT_SCENE_CHANGE_SECONDS, sceneIndexes } from "../../../lib/subtitle/common/sceneThreads";
import { PreviewCard } from "../types";
import { cardEndMs, cardStartMs } from "./cardTiming";

const MIN_SCENE_CHANGE_MS = 1000;

export function ensureSceneIndexes(cards: PreviewCard[], sceneSeconds = DEFAULT_SCENE_CHANGE_SECONDS): PreviewCard[] {
  const scenes = sceneIndexes(cards.filter((card) => !card.locked), Math.max(MIN_SCENE_CHANGE_MS, sceneSeconds * 1000), (card) => ({
    kind: isMusicText(card.source) ? "music" : "dialogue",
    start_ms: cardStartMs(card),
    end_ms: cardEndMs(card),
  }));
  let unlockedPosition = 0;
  let currentScene = 1;
  return cards.map((card) => {
    if (!card.locked) currentScene = scenes[unlockedPosition++]! + 1;
    return card.sceneIndex !== undefined ? card : { ...card, sceneIndex: currentScene };
  });
}

export function isSceneStart(card: PreviewCard, index: number, list: PreviewCard[]): boolean {
  if (card.sceneIndex === undefined) return false;
  return index === 0 || card.sceneIndex !== list[index - 1].sceneIndex;
}
