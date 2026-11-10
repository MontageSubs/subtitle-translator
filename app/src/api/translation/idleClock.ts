export interface IdleClockListener {
  held(active: boolean): void;
  discounted(milliseconds: number): void;
}

let holds = 0;
const listeners = new Set<IdleClockListener>();

export function holdClock(): () => void {
  let released = false;
  holds += 1;
  if (holds === 1) listeners.forEach((listener) => listener.held(true));
  return () => {
    if (released) return;
    released = true;
    holds -= 1;
    if (holds === 0) listeners.forEach((listener) => listener.held(false));
  };
}

export const isClockHeld = (): boolean => holds > 0;

export function discountClock(milliseconds: number): void {
  if (milliseconds > 0) listeners.forEach((listener) => listener.discounted(milliseconds));
}

export function subscribeIdleClock(listener: IdleClockListener): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
