export interface SmoothProgress {
  set(fraction: number): void;
  resume(): void;
  finish(): void;
  reset(initial?: number): void;
  stop(): void;
  value(): number;
}

interface Sample {
  at: number;
  fraction: number;
}

const DEFAULT_REFERENCE_SPEED = 0.04;
const MIN_SPEED = 0.004;
const MAX_SPEED = 0.5;
const STALL_SPEED_SHARE = 0.3;
const WINDOW_SECONDS = 5;
const RECENT_WINDOW_SECONDS = 1.5;
const WARMUP_SECONDS = 2;
const MIN_MEASURE_SECONDS = 0.05;
const DEFAULT_STEP = 0.03;
const STEP_SMOOTHING = 0.3;
const LEAD_STEP_SHARE = 0.5;
const MIN_LEAD = 0.01;
const MAX_LEAD = 0.05;
const LEAD_REMAINING_SHARE = 0.35;
const CREEP_SHARE = 0.25;
const CATCH_UP_SECONDS = 2.5;
const VELOCITY_LAG_SECONDS = 0.4;
const FINISH_SECONDS = 0.2;
const FINISH_LAG_SECONDS = 0.1;
const MAX_FRAME_SECONDS = 0.05;
const CEILING = 0.995;
const FINISHED_EPSILON = 0.001;
const PAINT_EPSILON = 0.0005;

let referenceSpeed = DEFAULT_REFERENCE_SPEED;

const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));

export function createSmoothProgress(paint: (fraction: number) => void): SmoothProgress {
  let real = 0;
  let shown = 0;
  let velocity = 0;
  let stepSize = DEFAULT_STEP;
  let samples: Sample[] = [{ at: performance.now(), fraction: 0 }];
  let hasData = false;
  let finishing = false;
  let interrupted = false;
  let painted = -1;
  let lastFrameAt = 0;
  let frame: number | undefined;

  function paintIfChanged(fraction: number): void {
    if (fraction !== 1 && Math.abs(fraction - painted) < PAINT_EPSILON) return;
    painted = fraction;
    paint(fraction);
  }

  function speedWithin(now: number, seconds: number): number {
    const anchor = samples.find((sample) => sample.at >= now - seconds * 1000);
    if (!anchor) return 0;
    const span = (now - anchor.at) / 1000;
    return span > MIN_MEASURE_SECONDS ? Math.max(0, real - anchor.fraction) / span : 0;
  }

  function measuredSpeed(now: number): number {
    while (samples.length > 1 && samples[1]!.at <= now - WINDOW_SECONDS * 1000) samples.shift();
    const span = (now - samples[0]!.at) / 1000;
    const measured = Math.max(speedWithin(now, WINDOW_SECONDS), speedWithin(now, RECENT_WINDOW_SECONDS));
    const trust = clamp(span / WARMUP_SECONDS, 0, 1);
    const blended = measured * trust + referenceSpeed * (1 - trust);
    return clamp(Math.max(blended, referenceSpeed * STALL_SPEED_SHARE), MIN_SPEED, MAX_SPEED);
  }

  function leadCap(): number {
    return Math.min(clamp(stepSize * LEAD_STEP_SHARE, MIN_LEAD, MAX_LEAD), (1 - real) * LEAD_REMAINING_SHARE);
  }

  function desiredVelocity(now: number): number {
    if (finishing) return (1 - shown) / FINISH_SECONDS;
    const cap = leadCap();
    const used = cap > 0 ? Math.max(0, shown - real) / cap : 1;
    const cruise = measuredSpeed(now) * Math.max(0, 1 - used * used);
    const creep = referenceSpeed * CREEP_SHARE * Math.max(0, 1 - used);
    return Math.max(cruise, creep) + Math.max(0, real - shown) / CATCH_UP_SECONDS;
  }

  function tick(now: number): void {
    const seconds = clamp((now - lastFrameAt) / 1000, 0, MAX_FRAME_SECONDS);
    lastFrameAt = now;
    const lag = finishing ? FINISH_LAG_SECONDS : VELOCITY_LAG_SECONDS;
    velocity += (desiredVelocity(now) - velocity) * (1 - Math.exp(-seconds / lag));
    shown = Math.min(finishing ? 1 : CEILING, shown + velocity * seconds);
    if (finishing && 1 - shown < FINISHED_EPSILON) shown = 1;
    paintIfChanged(shown);
    frame = finishing && shown === 1 ? undefined : window.requestAnimationFrame(tick);
  }

  function start(): void {
    if (frame !== undefined) return;
    const now = performance.now();
    if (interrupted) {
      samples = [{ at: now, fraction: real }];
      interrupted = false;
    }
    velocity = 0;
    lastFrameAt = now;
    frame = window.requestAnimationFrame(tick);
  }

  function stop(): void {
    if (frame === undefined) return;
    window.cancelAnimationFrame(frame);
    frame = undefined;
    velocity = 0;
    interrupted = true;
    if (hasData) referenceSpeed = clamp(measuredSpeed(performance.now()), MIN_SPEED, MAX_SPEED);
  }

  function noteRealData(fraction: number, now: number): void {
    if (fraction <= real) return;
    stepSize = stepSize * (1 - STEP_SMOOTHING) + (fraction - real) * STEP_SMOOTHING;
    hasData = true;
    real = fraction;
    samples.push({ at: now, fraction });
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
      stepSize = DEFAULT_STEP;
      samples = [{ at: performance.now(), fraction: initial }];
      hasData = false;
      finishing = false;
      interrupted = false;
      painted = -1;
      paintIfChanged(initial);
    },
    stop,
    value: () => shown,
  };
}
