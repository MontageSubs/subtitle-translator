import { DEFAULT_SCENE_CHANGE_SECONDS, sceneIndexes } from "../../../lib/subtitle/extraction/chapters";
import { PreviewCard } from "../types";
import { cardEndMs, cardStartMs } from "./cardTiming";

const MIN_SCENE_CHANGE_MS = 1000;

export function ensureSceneIndexes(cards: PreviewCard[], sceneSeconds = DEFAULT_SCENE_CHANGE_SECONDS): PreviewCard[] {
  const spans = cards.map((card) => ({ start_ms: cardStartMs(card), end_ms: cardEndMs(card) }));
  const scenes = sceneIndexes(spans, Math.max(MIN_SCENE_CHANGE_MS, sceneSeconds * 1000));
  return cards.map((card, index) => (card.sceneIndex !== undefined ? card : { ...card, sceneIndex: scenes[index] }));
}

export function isSceneStart(card: PreviewCard, index: number, list: PreviewCard[]): boolean {
  if (card.sceneIndex === undefined) return false;
  return index === 0 || card.sceneIndex !== list[index - 1].sceneIndex;
}
