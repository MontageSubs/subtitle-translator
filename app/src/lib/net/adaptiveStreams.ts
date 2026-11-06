export interface StreamGovernor {
  limit: () => number;
  record: (bytes: number) => void;
  reportFailure: () => void;
  onChange: (listener: () => void) => void;
  start: () => void;
  dispose: () => void;
}

export interface GovernorOptions {
  maxStreams: number;
  fixedStreams?: number;
}

type Phase = "warmup" | "slow" | "probing" | "settled";

const TICK_MS = 500;
const WINDOW_MS = 2_000;
const WARMUP_MS = 3_000;
const SETTLE_MS = 3_000;
const SLOW_RECHECK_MS = 8_000;
const REPROBE_MS = 20_000;
const MIN_PARALLEL_BYTES_PER_SECOND = 1.5 * 1024 * 1024;
const GAIN_TO_KEEP_GROWING = 1.2;
const GAIN_TO_KEEP_STREAM = 1.05;

export function createStreamGovernor({ maxStreams, fixedStreams }: GovernorOptions): StreamGovernor {
  const startedAt = performance.now();
  const samples: Array<{ at: number; total: number }> = [];
  let total = 0;
  let streams = Math.min(maxStreams, Math.max(1, fixedStreams ?? 1));
  let phase: Phase = "warmup";
  let phaseAt = startedAt;
  let referenceSpeed = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  let listener: (() => void) | undefined;

  const setStreams = (count: number): void => {
    const bounded = Math.min(maxStreams, Math.max(1, count));
    if (bounded === streams) return;
    streams = bounded;
    listener?.();
  };

  const speedAt = (now: number): number => {
    const base = samples.find(({ at }) => at >= now - WINDOW_MS) ?? samples[0];
    return base && now - base.at >= TICK_MS ? (total - base.total) / ((now - base.at) / 1000) : 0;
  };

  const beginProbe = (speed: number, now: number): void => {
    referenceSpeed = speed;
    setStreams(streams + 1);
    phase = "probing";
    phaseAt = now;
  };

  const settle = (now: number, speed: number): void => {
    phase = "settled";
    phaseAt = now;
    referenceSpeed = speed;
  };

  const advance = (now: number, speed: number): void => {
    if (phase === "warmup" && now - startedAt >= WARMUP_MS) {
      if (speed >= MIN_PARALLEL_BYTES_PER_SECOND) beginProbe(speed, now);
      else {
        phase = "slow";
        phaseAt = now;
      }
    } else if (phase === "slow" && now - phaseAt >= SLOW_RECHECK_MS) {
      if (speed >= MIN_PARALLEL_BYTES_PER_SECOND) beginProbe(speed, now);
      else phaseAt = now;
    } else if (phase === "probing" && now - phaseAt >= SETTLE_MS) {
      if (speed >= referenceSpeed * GAIN_TO_KEEP_GROWING && streams < maxStreams) return beginProbe(speed, now);
      if (speed < referenceSpeed * GAIN_TO_KEEP_STREAM) setStreams(streams - 1);
      settle(now, speed);
    } else if (phase === "settled" && now - phaseAt >= REPROBE_MS && streams < maxStreams) {
      beginProbe(speed, now);
    }
  };

  const tick = (): void => {
    const now = performance.now();
    samples.push({ at: now, total });
    while (samples.length > 2 && samples[1]!.at < now - 2 * WINDOW_MS) samples.shift();
    if (fixedStreams === undefined) advance(now, speedAt(now));
  };

  return {
    limit: () => streams,
    record: (bytes) => {
      if (bytes > 0) total += bytes;
    },
    reportFailure: () => {
      if (fixedStreams !== undefined) return;
      setStreams(streams - 1);
      settle(performance.now(), referenceSpeed);
    },
    onChange: (next) => {
      listener = next;
    },
    start: () => {
      samples.push({ at: performance.now(), total });
      timer ??= setInterval(tick, TICK_MS);
    },
    dispose: () => {
      if (timer !== undefined) clearInterval(timer);
      timer = undefined;
    },
  };
}
