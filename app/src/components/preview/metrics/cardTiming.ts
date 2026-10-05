import { PreviewCard } from "../types";

const FALLBACK_START_MS = 1000;
const MIN_DURATION_MS = 100;

function parseTimestampMs(timestamp: string): number {
  const parts = timestamp.split(":");
  if (parts.length < 2) return FALLBACK_START_MS;
  const [seconds, millis = "0"] = parts.pop()!.split(/[,.]/);
  const minutes = parts.pop() ?? "0";
  const hours = parts.pop() ?? "0";
  return ((Number(hours) * 60 + Number(minutes)) * 60 + Number(seconds)) * 1000 + Number(millis);
}

export function cardStartMs(card: PreviewCard): number {
  return card.start_ms ?? parseTimestampMs(card.start);
}

export function cardEndMs(card: PreviewCard): number {
  return card.end_ms ?? parseTimestampMs(card.end);
}

export function cardDurationMs(card: PreviewCard): number {
  return Math.max(MIN_DURATION_MS, cardEndMs(card) - cardStartMs(card));
}
