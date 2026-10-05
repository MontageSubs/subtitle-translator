import { findCardsByTime, parseTimeSearch } from "../metrics/timeSearch";
import { PreviewCard } from "../types";

const CUE_ID_QUERY_PATTERN = /^#(\d+)$/;

export function isPlainTextQuery(query: string): boolean {
  return Boolean(query) && !parseTimeSearch(query) && !query.startsWith("#");
}

export function findMatchedIds(query: string, cards: PreviewCard[], targetOf: (card: PreviewCard) => string): number[] {
  const time = parseTimeSearch(query);
  if (time) return findCardsByTime(cards, time);
  const idMatch = CUE_ID_QUERY_PATTERN.exec(query);
  if (idMatch) return cards.filter((card) => card.id === Number(idMatch[1])).map((card) => card.id);
  const needle = query.toLowerCase();
  return cards
    .filter((card) => card.source.toLowerCase().includes(needle) || targetOf(card).toLowerCase().includes(needle))
    .map((card) => card.id);
}
