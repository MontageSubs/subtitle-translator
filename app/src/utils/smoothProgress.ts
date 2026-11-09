export interface SmoothProgress {
  set(fraction: number): void;
  resume(): void;
  finish(): void;
  reset(initial?: number): void;
  stop(): void;
  value(): number;
}

const DEFAULT_REFERENCE_SPEED = 0.04;
const DEFAULT_REFERENCE_COLD_START_SECONDS = 5;
const MIN_REFERENCE_SPEED = 0.005;
const MAX_REFERENCE_SPEED = 0.5;
const MIN_COLD_START_SECONDS = 0.5;
const MAX_COLD_START_SECONDS = 30;
const LEAD_CAP_SCALE = 0.45;
const MIN_LEAD_CAP = 0.05;
const MAX_LEAD_CAP = 0.15;
const CREEP_DECAY_SECONDS = 8;
const REAL_SPEED_DECAY_SECONDS = 3;
const REAL_SPEED_SMOOTHING = 0.4;
const MIN_SAMPLE_SECONDS = 0.05;
const CATCH_UP_SECONDS = 0.8;
const FINISH_SECONDS = 0.15;
const RAMP_SECONDS = 0.4;
const MIN_ACCELERATION = 0.15;
const MAX_FRAME_SECONDS = 0.05;
const CEILING = 0.995;
const CATCH_UP_EPSILON = 0.002;
const FINISHED_EPSILON = 0.001;
const PAINT_EPSILON = 0.0005;

let referenceSpeed = DEFAULT_REFERENCE_SPEED;
let referenceColdStartSeconds = DEFAULT_REFERENCE_COLD_START_SECONDS;

const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));

export function createSmoothProgress(paint: (fraction: number) => void): SmoothProgress {
  let real = 0;
  let shown = 0;
  let velocity = 0;
  let realSpeed = 0;
  let finishing = false;
  let coldStartPending = true;
  let waitingSince = performance.now();
  let updatedAt = performance.now();
  let painted = -1;
  let lastFrameAt = 0;
  let frame: number | undefined;

  function paintIfChanged(fraction: number): void {
    if (fraction !== 1 && Math.abs(fraction - painted) < PAINT_EPSILON) return;
    painted = fraction;
    paint(fraction);
  }

  function leadCap(): number {
    const speed = Math.max(MIN_REFERENCE_SPEED, realSpeed || referenceSpeed);
    const estimatedSeconds = (coldStartPending ? referenceColdStartSeconds : 0) + (1 - real) / speed;
    const dynamic = clamp(LEAD_CAP_SCALE / estimatedSeconds, MIN_LEAD_CAP, MAX_LEAD_CAP);
    const waitDistance = referenceSpeed * referenceColdStartSeconds;
    return Math.min(dynamic, (1 - real) / 2, Math.max(waitDistance, MIN_LEAD_CAP / 2));
  }

  function desiredVelocity(now: number): number {
    if (finishing) return (1 - shown) / FINISH_SECONDS;
    const sinceUpdate = (now - updatedAt) / 1000;
    const followSpeed = realSpeed * Math.exp(-sinceUpdate / REAL_SPEED_DECAY_SECONDS);
    if (shown < real - CATCH_UP_EPSILON) return (real - shown) / CATCH_UP_SECONDS + followSpeed;
    const cap = leadCap();
    const room = Math.max(0, cap - Math.max(0, shown - real));
    const creep = referenceSpeed * Math.exp(-sinceUpdate / CREEP_DECAY_SECONDS) * (cap > 0 ? room / cap : 0);
    let desired = Math.max(followSpeed, creep);
    if (followSpeed > 0 && shown > real && real < 1) desired = Math.min(desired, (followSpeed * (1 - shown)) / (1 - real));
    return shown >= CEILING ? 0 : desired;
  }

  function tick(now: number): void {
    const seconds = Math.min(MAX_FRAME_SECONDS, (now - lastFrameAt) / 1000);
    lastFrameAt = now;
    const desired = desiredVelocity(now);
    const acceleration = Math.max(MIN_ACCELERATION, Math.abs(desired - velocity) / RAMP_SECONDS);
    velocity = Math.max(0, velocity + clamp(desired - velocity, -acceleration * seconds, acceleration * seconds));
    shown = finishing ? Math.min(1, shown + velocity * seconds) : Math.min(CEILING, shown + velocity * seconds);
    if (finishing && 1 - shown < FINISHED_EPSILON) shown = 1;
    paintIfChanged(shown);
    frame = finishing && shown === 1 ? undefined : window.requestAnimationFrame(tick);
  }

  function start(): void {
    if (frame !== undefined) return;
    velocity = 0;
    updatedAt = performance.now();
    lastFrameAt = updatedAt;
    frame = window.requestAnimationFrame(tick);
  }

  function stop(): void {
    if (frame === undefined) return;
    window.cancelAnimationFrame(frame);
    frame = undefined;
    if (realSpeed > 0) referenceSpeed = clamp(realSpeed, MIN_REFERENCE_SPEED, MAX_REFERENCE_SPEED);
  }

  function noteRealData(fraction: number, now: number): void {
    if (fraction <= real) return;
    if (coldStartPending) {
      referenceColdStartSeconds = clamp((now - waitingSince) / 1000, MIN_COLD_START_SECONDS, MAX_COLD_START_SECONDS);
      coldStartPending = false;
    } else {
      const seconds = (now - updatedAt) / 1000;
      if (seconds >= MIN_SAMPLE_SECONDS) {
        const sample = (fraction - real) / seconds;
        realSpeed = realSpeed > 0 ? realSpeed * (1 - REAL_SPEED_SMOOTHING) + sample * REAL_SPEED_SMOOTHING : sample;
      }
    }
    real = fraction;
    updatedAt = now;
  }

  return {
    set(fraction) {
      noteRealData(Math.min(1, fraction), performance.now());
      start();
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
      realSpeed = 0;
      finishing = false;
      coldStartPending = true;
      waitingSince = performance.now();
      updatedAt = waitingSince;
      painted = -1;
      paintIfChanged(initial);
    },
    stop,
    value: () => shown,
  };
}
