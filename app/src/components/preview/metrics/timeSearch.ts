import { PreviewCard, TimeSearchResult } from "../types";
import { cardEndMs, cardStartMs } from "./cardTiming";

const CLOCK_PATTERN = /^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:[,.](\d{1,3}))?$/;
const SECONDS_PATTERN = /^(\d+(?:\.\d+)?)s?$/i;
const RANGE_SEPARATOR_PATTERN = /\s*[-~—–]\s*/;

function fractionToMs(fraction: string | undefined): number {
  if (fraction === undefined) return 0;
  return Number(fraction.padEnd(3, "0").slice(0, 3));
}

function parseTimeToken(token: string): number | null {
  const trimmed = token.trim();
  const clock = CLOCK_PATTERN.exec(trimmed);
  if (clock) {
    const first = Number(clock[1]);
    const second = Number(clock[2]);
    const millis = fractionToMs(clock[4]);
    return clock[3] !== undefined
      ? ((first * 60 + second) * 60 + Number(clock[3])) * 1000 + millis
      : (first * 60 + second) * 1000 + millis;
  }
  const seconds = SECONDS_PATTERN.exec(trimmed);
  return seconds ? Math.round(Number(seconds[1]) * 1000) : null;
}

export function parseTimeSearch(query: string): TimeSearchResult | null {
  const trimmed = query.trim();
  if (!trimmed) return null;
  const range = trimmed.split(RANGE_SEPARATOR_PATTERN);
  if (range.length === 2) {
    const from = parseTimeToken(range[0]);
    const to = parseTimeToken(range[1]);
    if (from !== null && to !== null) return { isTime: true, isRange: true, startMs: Math.min(from, to), endMs: Math.max(from, to) };
  }
  const point = parseTimeToken(trimmed);
  return point === null ? null : { isTime: true, isRange: false, startMs: point };
}

function nearestByStart(cards: PreviewCard[], targetMs: number): PreviewCard | undefined {
  return cards.reduce<PreviewCard | undefined>(
    (best, card) => (!best || Math.abs(cardStartMs(card) - targetMs) < Math.abs(cardStartMs(best) - targetMs) ? card : best),
    undefined
  );
}

export function findCardsByTime(cards: PreviewCard[], search: TimeSearchResult): number[] {
  if (!cards.length) return [];
  if (search.isRange) {
    const overlapping = cards.filter((card) => cardStartMs(card) <= search.endMs! && cardEndMs(card) >= search.startMs);
    if (overlapping.length) return overlapping.map((card) => card.id);
    return [nearestByStart(cards, search.startMs)!.id];
  }
  const last = cards[cards.length - 1];
  if (search.startMs >= cardEndMs(last)) return [last.id];
  const containing = cards.find((card) => cardStartMs(card) <= search.startMs && search.startMs <= cardEndMs(card));
  return [(containing ?? nearestByStart(cards, search.startMs)!).id];
}
