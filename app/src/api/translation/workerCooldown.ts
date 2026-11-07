const COOLDOWN_MS: readonly number[] = [30_000, 60_000];
const SEGMENTED_FROM_STRIKE = 2;

export type RequestScope = "full" | "segmented";

interface CooldownState {
  strikes: number;
  until: number;
}

const state: CooldownState = { strikes: 0, until: 0 };
const listeners = new Set<() => void>();

const notify = (): void => listeners.forEach((listener) => listener());

export function noteWorkerLimit(now: number = Date.now()): void {
  state.strikes += 1;
  state.until = now + (COOLDOWN_MS[state.strikes - 1] ?? 0);
  notify();
}

export function noteTranslationSuccess(): void {
  if (state.strikes === 0) return;
  state.strikes = 0;
  state.until = 0;
  notify();
}

export function activeCooldownUntil(now: number = Date.now()): number | null {
  return state.until > now ? state.until : null;
}

export function exhaustedWorkerRetries(): boolean {
  return state.strikes > COOLDOWN_MS.length;
}

export function requestScope(): RequestScope {
  return state.strikes >= SEGMENTED_FROM_STRIKE ? "segmented" : "full";
}

export function onCooldownChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
