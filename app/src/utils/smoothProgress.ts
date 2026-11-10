export interface SmoothProgress {
  set(fraction: number): void;
  resume(): void;
  finish(): void;
  reset(initial?: number): void;
  stop(): void;
  value(): number;
  hasCrawled(): boolean;
}

const COLD_SPEED = 0.008;
const COLD_LEAD = 0.12;
const MIN_LEAD = 0.008;
const LEAD_STEPS = 1.25;
const LEAD_REMAINING_SHARE = 0.6;
const SMOOTHING = 0.35;
const MIN_GAP_SECONDS = 0.25;
const MIN_SPEED_SHARE = 0.25;
const MAX_CATCH_UP_SHARE = 3;
const CATCH_UP_SECONDS = 2;
const ACCELERATION_SECONDS = 1.5;
const FINISH_SECONDS = 0.2;
const FINISH_LAG_SECONDS = 0.1;
const MAX_FRAME_SECONDS = 0.05;
const CEILING = 0.995;
const FINISHED_EPSILON = 0.001;
const PAINT_EPSILON = 0.0005;

export const MIN_VISIBLE_FRACTION = 0.01;

export function createSmoothProgress(paint: (fraction: number) => void): SmoothProgress {
  let real = 0;
  let shown = 0;
  let velocity = 0;
  let stepSize = 0;
  let gapSeconds = 0;
  let lastDataAt = 0;
  let hasData = false;
  let finishing = false;
  let crawled = false;
  let painted = -1;
  let lastFrameAt = 0;
  let frame: number | undefined;

  function paintIfChanged(fraction: number): void {
    if (fraction !== 1 && Math.abs(fraction - painted) < PAINT_EPSILON) return;
    painted = fraction;
    paint(fraction);
  }

  const cycleSpeed = (): number => (hasData ? stepSize / Math.max(gapSeconds, MIN_GAP_SECONDS) : COLD_SPEED);

  function lead(): number {
    const base = hasData ? Math.max(stepSize * LEAD_STEPS, MIN_LEAD) : COLD_LEAD;
    return Math.min(base, (1 - real) * LEAD_REMAINING_SHARE);
  }

  function desiredVelocity(speed: number): number {
    const ahead = shown - real;
    if (ahead <= 0) return Math.min(speed + -ahead / CATCH_UP_SECONDS, speed * MAX_CATCH_UP_SHARE);
    const reach = ahead / lead();
    return speed * Math.max(MIN_SPEED_SHARE, 1 / (1 + reach * reach));
  }

  function tick(now: number): void {
    const seconds = Math.min(MAX_FRAME_SECONDS, Math.max(0, (now - lastFrameAt) / 1000));
    lastFrameAt = now;
    if (finishing) {
      velocity += ((1 - shown) / FINISH_SECONDS - velocity) * (1 - Math.exp(-seconds / FINISH_LAG_SECONDS));
    } else {
      const speed = cycleSpeed();
      const step = (speed / ACCELERATION_SECONDS) * seconds;
      velocity += Math.min(step, Math.max(-step, desiredVelocity(speed) - velocity));
    }
    shown = Math.min(finishing ? 1 : CEILING, shown + velocity * seconds);
    if (shown >= MIN_VISIBLE_FRACTION) crawled = true;
    if (finishing && 1 - shown < FINISHED_EPSILON) shown = 1;
    paintIfChanged(shown);
    frame = finishing && shown === 1 ? undefined : window.requestAnimationFrame(tick);
  }

  function start(): void {
    if (frame !== undefined) return;
    const now = performance.now();
    lastDataAt = now;
    lastFrameAt = now;
    frame = window.requestAnimationFrame(tick);
  }

  function stop(): void {
    if (frame === undefined) return;
    window.cancelAnimationFrame(frame);
    frame = undefined;
    velocity = 0;
  }

  function noteRealData(fraction: number, now: number): void {
    if (fraction <= real) return;
    const interval = (now - lastDataAt) / 1000;
    const step = fraction - real;
    if (hasData) {
      stepSize = stepSize * (1 - SMOOTHING) + step * SMOOTHING;
      gapSeconds = gapSeconds * (1 - SMOOTHING) + interval * SMOOTHING;
    } else if (interval >= MIN_GAP_SECONDS) {
      stepSize = step;
      gapSeconds = interval;
      hasData = true;
    }
    real = fraction;
    lastDataAt = now;
  }

  return {
    set(fraction) {
      start();
      noteRealData(Math.min(1, fraction), performance.now());
    },
    resume: start,
    finish() {
      finishing = true;
      start();
    },
    reset(initial = 0) {
      stop();
      real = initial;
      shown = initial;
      velocity = 0;
      stepSize = 0;
      gapSeconds = 0;
      hasData = false;
      finishing = false;
      crawled = initial >= MIN_VISIBLE_FRACTION;
      painted = -1;
      paintIfChanged(initial);
    },
    stop,
    value: () => shown,
    hasCrawled: () => crawled,
  };
}
