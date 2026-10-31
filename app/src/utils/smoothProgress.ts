export interface SmoothProgress {
  set(fraction: number): void;
  finish(): void;
  reset(initial?: number): void;
  stop(): void;
  value(): number;
}

const MAX_LEAD = 0.1;
const LEAD_OF_REMAINING = 0.6;
const CREEP_RAMP_MS = 6000;
const CATCH_UP_RESPONSE_MS = 500;
const CREEP_RESPONSE_MS = 1800;
const FINISH_RESPONSE_MS = 150;
const MAX_FRAME_MS = 50;
const CEILING = 0.995;
const FINISHED_EPSILON = 0.001;
const PAINT_EPSILON = 0.0005;

export function createSmoothProgress(paint: (fraction: number) => void): SmoothProgress {
  let real = 0;
  let shown = 0;
  let finishing = false;
  let updatedAt = 0;
  let painted = -1;
  let lastFrameAt = 0;
  let frame: number | undefined;

  function paintIfChanged(fraction: number): void {
    if (fraction !== 1 && Math.abs(fraction - painted) < PAINT_EPSILON) return;
    painted = fraction;
    paint(fraction);
  }

  function tick(now: number): void {
    const elapsed = Math.min(MAX_FRAME_MS, now - lastFrameAt);
    lastFrameAt = now;
    const lead = Math.min(MAX_LEAD, (1 - real) * LEAD_OF_REMAINING) * (1 - Math.exp(-(now - updatedAt) / CREEP_RAMP_MS));
    const target = finishing ? 1 : Math.min(CEILING, real + lead);
    const response = finishing ? FINISH_RESPONSE_MS : shown < real ? CATCH_UP_RESPONSE_MS : CREEP_RESPONSE_MS;
    shown = Math.max(shown, shown + (target - shown) * (1 - Math.exp(-elapsed / response)));
    if (finishing && 1 - shown < FINISHED_EPSILON) shown = 1;
    paintIfChanged(shown);
    frame = finishing && shown === 1 ? undefined : window.requestAnimationFrame(tick);
  }

  function start(): void {
    if (frame !== undefined) return;
    lastFrameAt = performance.now();
    frame = window.requestAnimationFrame(tick);
  }

  function stop(): void {
    if (frame !== undefined) window.cancelAnimationFrame(frame);
    frame = undefined;
  }

  return {
    set(fraction) {
      real = Math.max(real, Math.min(1, fraction));
      updatedAt = performance.now();
      start();
    },
    finish() {
      finishing = true;
      start();
    },
    reset(initial = 0) {
      stop();
      real = initial;
      shown = initial;
      finishing = false;
      updatedAt = performance.now();
      painted = -1;
      paintIfChanged(initial);
    },
    stop,
    value: () => shown,
  };
}
